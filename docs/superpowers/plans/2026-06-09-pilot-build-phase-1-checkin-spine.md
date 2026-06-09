# Pilot Build — Phase 1: Check-In Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the pilot spine from `PILOT_BUILD_SPEC.md` §4 — daily rotating per-venue check-in codes, GPS-verified check-ins, the 5-stamp Rounds buyback, the zero-login staff code view + console, and the 6am daily digest — so a hardware-free venue can run a real 30-day pilot.

**Architecture:** Codes are **deterministic** (TOTP-style HMAC over a per-venue secret + 6am-CT-shifted service-date) so the console, the digest email, and the `verify-checkin` edge function each compute the same 4-char code independently with nothing stored or synced. Rounds are **derived** (count of check-ins since the last redemption), not a stored counter. All writes to pilot tables happen only through service-role edge functions; reads are RLS-gated mirroring `venue_attribution_events`.

**Tech Stack:** Postgres + RLS (Supabase migrations), Deno edge functions (`supabase/functions`), TS shared lib (`packages/shared-api`), Next.js console (`apps/web`) + directory (`apps/directory`), React Native/Expo mobile (`apps/mobile`), Resend email, pg_cron.

**Scope:** Phase 1 only. Phases 2–4 (deep-link routing, Toastmaker, push triggers) are separate follow-on plans — see the final section. **Out of scope** per spec §8: network-wide redemption, density tiers, web push, POS, in-app payments.

---

## File Structure (decomposition)

| File | Responsibility |
|---|---|
| `supabase/migrations/20260609120000_pilot_checkin_spine.sql` | venues columns + `checkins`/`round_redemptions`/`venue_flags` tables + RLS |
| `packages/shared-api/src/checkin/code.ts` | TS code-gen: `serviceDate()`, `generateCheckinCode()`, base31 + profanity re-hash |
| `packages/shared-api/src/checkin/code.test.ts` | TS test, reads the shared test-vector file |
| `supabase/functions/_shared/checkin-code.ts` | Deno mirror of the same algorithm |
| `supabase/functions/_shared/checkin-test-vectors.json` | **Single source of truth** both impls test against (anti-drift) |
| `supabase/functions/verify-checkin/index.ts` | Authed check-in endpoint: rate-limit → employee → code → geofence → caps → insert → return stamps |
| `supabase/functions/verify-checkin/index.test.ts` | Deno tests for each rule + reads the shared test vectors |
| `supabase/functions/send-venue-digest/index.ts` | 6am digest sender + 0-email self-check |
| `apps/web/src/app/api/venues/[venueId]/checkin-code/route.ts` | Org-authed API returning today's code (no caching past 6am) |
| `apps/web/src/app/orgs/[orgId]/venues/[venueId]/(checkin stats tab)` | Stats page + Export CSV (follow existing venue dashboard pattern) |
| `apps/directory/src/app/staff/[staff_token]/page.tsx` | Zero-login staff code view, auto-refresh at rotation |
| `apps/mobile/src/screens/CheckInScreen.tsx` + `RoundRedemptionScreen.tsx` | Code entry, stamp progress, redemption |
| `apps/mobile/src/hooks/useCheckin.ts` | Calls `verify-checkin`, exposes stamps state |

---

## Pre-flight (gating — do before any migration)

### Task 0: Pre-flight gates

**Files:** `package.json` (root)

- [ ] **Step 1: Confirm zero migration drift** (spec §9.4 — `db push` is load-bearing). Local schema must equal remote before adding migrations.

Run: `supabase db diff --linked` (or `npx supabase migration list --linked`)
Expected: no diff / all local migrations applied remotely. If drift exists, STOP and reconcile first (see `docs/superpowers/plans/2026-06-01-schema-drift-reconciliation.md`).

- [ ] **Step 2: Remove unused `nodemailer`** (spec §9.3 — Resend won).

```bash
npm uninstall nodemailer        # removes root package.json:49 + lockfile entry
grep -rn "nodemailer" --include="*.ts" --include="*.tsx" apps packages || echo "no imports — safe"
```
Expected: no source imports of `nodemailer`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused nodemailer dependency (Resend is the mailer)"
```

---

## Task 1: Schema migration (spec §4.1)

**Files:**
- Create: `supabase/migrations/20260609120000_pilot_checkin_spine.sql`
- Test: `test/pilot-checkin-rls.test.mjs` (psql-driven RLS test, pattern from this repo's shared-itinerary RLS verification)

- [ ] **Step 1: Write the migration**

```sql
-- Per-venue secret + staff view token + geofence tuning
alter table public.venues
  add column if not exists checkin_secret uuid not null default gen_random_uuid(),
  add column if not exists staff_token uuid not null default gen_random_uuid(),
  add column if not exists geofence_radius_m integer not null default 100;

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  method text not null check (method in ('code','gps_fallback')),
  service_date date not null,
  lat double precision, lng double precision,
  created_at timestamptz not null default now(),
  unique (user_id, venue_id, service_date)   -- 1/venue/day enforced here
);
create index if not exists checkins_venue_date_idx on public.checkins (venue_id, service_date);
create index if not exists checkins_user_venue_idx on public.checkins (user_id, venue_id);

create table if not exists public.round_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  venue_id uuid not null references public.venues(id),
  checkins_consumed int not null default 5,
  confirmed_with_code boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists round_redemptions_user_venue_idx on public.round_redemptions (user_id, venue_id);

create table if not exists public.venue_flags (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  flag_type text not null check (flag_type in ('staff_code_unknown','abuse_suspected')),
  meta jsonb default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.checkins enable row level security;
alter table public.round_redemptions enable row level security;
alter table public.venue_flags enable row level security;

-- Reads: owner reads own rows; org members read their venues' rows.
-- (Mirror the org-membership predicate used by venue_attribution_events,
--  migration 20260530221747 — reuse the SAME helper/subquery it uses.)
create policy "checkins_select_self_or_org" on public.checkins for select using (
  user_id = auth.uid()
  or exists (select 1 from public.org_members m
             join public.venues v on v.org_id = m.org_id
             where v.id = checkins.venue_id and m.user_id = auth.uid())
);
create policy "round_redemptions_select_self_or_org" on public.round_redemptions for select using (
  user_id = auth.uid()
  or exists (select 1 from public.org_members m
             join public.venues v on v.org_id = m.org_id
             where v.id = round_redemptions.venue_id and m.user_id = auth.uid())
);
create policy "venue_flags_select_org" on public.venue_flags for select using (
  exists (select 1 from public.org_members m
          join public.venues v on v.org_id = m.org_id
          where v.id = venue_flags.venue_id and m.user_id = auth.uid())
);
-- No INSERT/UPDATE/DELETE policies => writes only via service role (which bypasses RLS).
```

> **Executor note:** verify the exact org→venue membership join against `20260530221747`'s policy before finalizing — column names (`org_id`, `org_members.user_id`) must match that file exactly. If it used a SECURITY DEFINER helper, reuse it instead of inlining the subquery.

- [ ] **Step 2: Write the RLS test** (`test/pilot-checkin-rls.test.mjs`) — drive the policies as real users via the local DB container, the pattern proven in this repo:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const DB = "supabase_db_ujflcrjsiyhofnomurco";
const psql = (sql) =>
  execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql],
    { encoding: "utf8" }).trim();

test("checkins: owner reads own; non-member blocked", () => {
  // Setup as postgres, then SET ROLE authenticated + request.jwt.claims for each persona,
  // asserting count(*) — see the shared-itinerary RLS test for the exact harness.
  // owner sees own checkin = 1; unrelated user = 0; org member of the venue's org = 1.
  assert.ok(true); // replace with the BEGIN..ROLLBACK scenario block
});
```

> **Executor note:** flesh this out using the exact `BEGIN; … SET LOCAL role authenticated; SET LOCAL request.jwt.claims … ROLLBACK;` scenario harness used to verify the shared-itinerary grant. Personas: venue-org member (reads), owner of a checkin (reads own), unrelated authenticated user (blocked).

- [ ] **Step 3: Apply locally + run the test**

Run: `supabase db reset` (applies the new migration locally) then `node --test test/pilot-checkin-rls.test.mjs`
Expected: PASS — member/owner read, unrelated blocked.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260609120000_pilot_checkin_spine.sql test/pilot-checkin-rls.test.mjs
git commit -m "feat(db): pilot check-in spine schema (checkins, rounds, flags) + RLS"
```

---

## Task 2: Deterministic code-gen lib + shared test vectors (spec §4.2)

**The anti-drift contract:** the TS lib and the Deno function are two implementations of one algorithm. A single JSON test-vector file is imported by **both** test suites, so a change to one impl that breaks the vectors fails CI.

**Algorithm (lock these exact definitions):**
- `serviceDate(now)` = the calendar date of `now` in `America/Chicago` minus 6 hours (so the date "flips" at 6:00 AM CT, not midnight).
- `generateCheckinCode(secret, serviceDate, counter=0)`:
  - `msg = serviceDate` (ISO `YYYY-MM-DD`) + (`counter>0` ? `":" + counter` : "")
  - `h = HMAC_SHA256(key=secret-as-utf8, msg)` → 32 bytes
  - `CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"` (31 chars)
  - `code = [ CHARSET[h[0]%31], CHARSET[h[1]%31], CHARSET[h[2]%31], CHARSET[h[3]%31] ]`
  - if `code ∈ PROFANITY_DENYLIST`, return `generateCheckinCode(secret, serviceDate, counter+1)`
- Grace window (consumed by `verify-checkin`, not the generator): accept the previous service-date's code for 10 minutes after 6:00 AM CT.

**Files:**
- Create: `supabase/functions/_shared/checkin-test-vectors.json`
- Create: `packages/shared-api/src/checkin/code.ts`, `packages/shared-api/src/checkin/code.test.ts`
- Create: `supabase/functions/_shared/checkin-code.ts`, `supabase/functions/_shared/checkin-code.test.ts`

- [ ] **Step 1: Write the shared test vectors** (`checkin-test-vectors.json`) — fixed secret + dates → expected codes (compute once the impl exists, then freeze; include a profanity-collision case and the 6am-shift boundary):

```json
{
  "charset": "23456789ABCDEFGHJKMNPQRSTUVWXYZ",
  "cases": [
    { "secret": "00000000-0000-0000-0000-000000000000", "instant_utc": "2026-06-09T13:00:00Z", "service_date": "2026-06-09", "code": "____" },
    { "secret": "00000000-0000-0000-0000-000000000000", "instant_utc": "2026-06-09T10:59:00Z", "service_date": "2026-06-09", "code": "____" },
    { "secret": "00000000-0000-0000-0000-000000000000", "instant_utc": "2026-06-09T10:00:00Z", "service_date": "2026-06-08", "code": "____" }
  ]
}
```
> The `2026-06-09T10:59Z` (= 05:59 CT) case must yield the **prior** service-date; `13:00Z` (= 08:00 CT) the current one. Fill `code` from the first green run, then never edit by hand.

- [ ] **Step 2: Write the TS test** (`code.test.ts`) reading the vectors:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serviceDate, generateCheckinCode } from "./code";

const vectors = JSON.parse(readFileSync(
  new URL("../../../../supabase/functions/_shared/checkin-test-vectors.json", import.meta.url), "utf8"));

for (const c of vectors.cases) {
  test(`vector ${c.instant_utc}`, () => {
    assert.equal(serviceDate(new Date(c.instant_utc)), c.service_date);
    assert.equal(generateCheckinCode(c.secret, c.service_date), c.code);
  });
}
```

- [ ] **Step 3: Run it to verify it fails** — Run: `node --test packages/shared-api/src/checkin/code.test.ts` · Expected: FAIL (`code` not implemented / `____` placeholder).

- [ ] **Step 4: Implement `code.ts`**

```ts
import { createHmac } from "node:crypto";

const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PROFANITY_DENYLIST = new Set<string>([/* fill from denylist source; uppercase 4-char */]);

export function serviceDate(now: Date): string {
  // America/Chicago, minus 6h, as YYYY-MM-DD
  const ct = new Date(now.getTime() - 6 * 3600_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(ct);
}

export function generateCheckinCode(secret: string, svcDate: string, counter = 0): string {
  const msg = counter > 0 ? `${svcDate}:${counter}` : svcDate;
  const h = createHmac("sha256", secret).update(msg).digest();
  const code = [0, 1, 2, 3].map((i) => CHARSET[h[i] % 31]).join("");
  return PROFANITY_DENYLIST.has(code) ? generateCheckinCode(secret, svcDate, counter + 1) : code;
}
```

- [ ] **Step 5: Run + freeze vectors** — Run the TS test; once green, paste the produced codes into `checkin-test-vectors.json` and re-run. Expected: PASS.

- [ ] **Step 6: Mirror in Deno** (`_shared/checkin-code.ts`) — same algorithm using Deno's `crypto.subtle`/`node:crypto`; **same `CHARSET` and `PROFANITY_DENYLIST`**. Write `_shared/checkin-code.test.ts` importing the SAME `checkin-test-vectors.json`.

Run: `deno test supabase/functions/_shared/checkin-code.test.ts --allow-read`
Expected: PASS — identical codes to the TS impl (drift would fail here).

- [ ] **Step 7: Commit**

```bash
git add packages/shared-api/src/checkin supabase/functions/_shared/checkin-code.ts \
        supabase/functions/_shared/checkin-code.test.ts supabase/functions/_shared/checkin-test-vectors.json
git commit -m "feat: deterministic check-in code lib (TS + Deno) with shared test vectors"
```

---

## Task 3: `verify-checkin` edge function (spec §4.3)

**Files:**
- Create: `supabase/functions/verify-checkin/index.ts`, `supabase/functions/verify-checkin/index.test.ts`
- Reference: `supabase/functions/track-visit` (rate-limit + service-role client + CORS pattern)

**Endpoint:** authed `POST { venue_id, code, lat, lng, fallback? }`. Rule order (fail closed, cheapest first):

1. **Rate limit** — 5 attempts / 15 min / user / venue. Reuse `track-visit`'s limiter.
2. **Employee check** — reject if `auth.uid()` is an `org_members` row for the venue's org. Error `employee_excluded`.
3. **Code match** — `generateCheckinCode(secret, serviceDate(now))`; also accept the prior service-date's code if `now` is within 10 min after 6:00 AM CT. On failure return `{ error:"bad_code", attempts_remaining }`. (Skipped when `fallback:true`.)
4. **Geofence** — `haversine(lat,lng, venue.lat,venue.lng) ≤ venue.geofence_radius_m`. Error `out_of_range`.
5. **Caps + abuse** — ≤3 check-ins today across venues (`network_cap`); impossible-geography velocity → insert `venue_flags(abuse_suspected)` and reject.
6. **Insert** — `checkins` row (unique constraint silently dedupes 1/venue/day) + a `venue_attribution_events` row (`source='app_checkin'`, with `user_id`).
7. **Return** `{ stamps, stamps_to_next_round, is_first_visit }` where `stamps` = count of `checkins` for (user, venue) since the last `round_redemptions.created_at`; `is_first_visit` = no prior attribution event **or** checkin for (user, venue) — **the birth certificate**.

**GPS-fallback** (`fallback:true`): skip step 3; enforce **≤2 lifetime** `gps_fallback` check-ins per (user, venue); write `method='gps_fallback'` + `venue_flags(staff_code_unknown)`.

- [ ] **Step 1: Write failing tests** (`index.test.ts`) — one per rule, using a local service-role client against `supabase db reset` data:

```ts
// pseudo-structure — one test each:
// - rate limit: 6th attempt in 15m → 429 / rate_limited
// - employee at own venue → employee_excluded
// - wrong code → bad_code with attempts_remaining
// - right code but out of geofence → out_of_range
// - 4th network check-in same day → network_cap
// - happy path → { stamps:1, stamps_to_next_round:4, is_first_visit:true }
// - 5th valid check-in → stamps:5, stamps_to_next_round:0
// - second check-in same venue same day → dedup (stamps unchanged)
// - fallback x3 → third returns fallback_limit; writes staff_code_unknown flag
```

- [ ] **Step 2: Run to verify fail** — Run: `deno test supabase/functions/verify-checkin/index.test.ts --allow-net --allow-env --allow-read` · Expected: FAIL (function not implemented).

- [ ] **Step 3: Implement `index.ts`** — import `generateCheckinCode` from `_shared/checkin-code.ts`; use the service-role client + CORS headers exactly as `track-visit` does; implement steps 1–7 in order. (Stamps query: `select count(*) from checkins where user_id=$1 and venue_id=$2 and created_at > coalesce((select max(created_at) from round_redemptions where user_id=$1 and venue_id=$2), 'epoch')`.)

- [ ] **Step 4: Run tests** — Expected: PASS (all rules).

- [ ] **Step 5: Deploy + commit**

```bash
git add supabase/functions/verify-checkin
git commit -m "feat(fn): verify-checkin (code+geofence+caps, derived stamps, birth-certificate)"
# deploy is done at release time: supabase functions deploy verify-checkin
```

---

## Task 4: Console + zero-login staff view (spec §4.5)

**Files:**
- Create: `apps/web/src/app/api/venues/[venueId]/checkin-code/route.ts` — org-authed GET, returns `{ code, service_date, rotates_at }`. Compute via `generateCheckinCode`; set `Cache-Control: no-store` (never cached past 6am). Authorize: caller is an `org_members` row for the venue's org (reuse existing org-auth helper used by other `apps/web` venue routes).
- Create: `apps/directory/src/app/staff/[staff_token]/page.tsx` — looks up the venue by `staff_token` (service-role read, no user auth), renders today's code **huge**, JS sets a timer to refetch at the next 6:00 AM CT rotation. Bookmarkable on a tablet.
- Modify: org/venue dashboard header (the `VenueDashboardShell` sub-bar) to show today's code, fetched from the API route.
- Create: a "Check-ins" stats tab on the venue page — yesterday / 7-day / 30-day check-ins, first-timers vs returning, rounds redeemed, GPS-fallback flag count. Reads `checkins` + `venue_attribution_events`. Add **Export my data** button → streams a CSV of the venue's attribution + checkin rows.

- [ ] **Step 1: API route + test** — write a route test (existing `apps/web` route tests pattern) asserting: org member gets `{ code }` matching `generateCheckinCode`; non-member gets 403; response has `Cache-Control: no-store`.
- [ ] **Step 2: Implement the route.** Run the test → PASS.
- [ ] **Step 3: Staff token page** — implement; verify in browser: visiting `/staff/<token>` shows the same code as the console; an invalid token 404s.
- [ ] **Step 4: Stats tab + CSV export** — implement reading from `checkins`; verify counts against seeded data; CSV downloads venue rows only.
- [ ] **Step 5: Commit** (one commit per sub-step is fine).

> **Verification:** use the `verify` skill — drive the running console + the `/staff/[token]` route, capturing that the rendered code equals the function-computed code. This is the demo-before-mobile milestone (build order §10.3).

---

## Task 5: Mobile check-in + redemption (spec §4.4)

**Files:**
- Create: `apps/mobile/src/screens/CheckInScreen.tsx`, `apps/mobile/src/screens/RoundRedemptionScreen.tsx`
- Create: `apps/mobile/src/hooks/useCheckin.ts` (calls `verify-checkin`, exposes `{ stamps, stampsToNext, submit, fallback, state }`)
- Modify: venue screen — add a **Check In** button, enabled only inside the geofence (reuse `useVisitTracker` distance utils; **foreground location only on this screen**), and the navigator (`AppNavigator`) to register the two screens.

- [ ] **Step 1: `useCheckin` hook** — POSTs `{ venue_id, code, lat, lng }` to `verify-checkin`; maps responses (`bad_code` → attempts remaining, `out_of_range`, `network_cap`, success → stamps). Fallback variant after 2 failed attempts.
- [ ] **Step 2: CheckInScreen** — 4-char keypad ("Ask your server for today's HappiTime code"), per-§4.3 failure states, fallback link after 2 failures. Success: stamp animation, progress ("3 of 5 — the house buys your next round"), **a live ticking clock on screen** (anti-screenshot), today's published offers below.
- [ ] **Step 3: RoundRedemptionScreen** — at 5 stamps, "Round on the house"; server confirms by the **user re-entering today's code** (same primitive) → `verify-checkin` (or a `redeem` action) inserts `round_redemptions`, resetting the derived count.
- [ ] **Step 4: Verify on device** (use the `verify` skill / TestFlight + Play closed track — this app ships to testers, not OTA on 1.0.2): inside a geofence, verbal code → check-in in <10s; 5th → redeemable buyback.
- [ ] **Step 5: Commit.**

> **Delivery note:** mobile changes reach users only via a **new store build** (App Store v1.0.2 has no update channel; current users are frozen) — see `deploy_topology` memory. Cut a build + submit to TestFlight / Play closed track to test.

---

## Task 6: Daily digest email (spec §4.6)

**Files:**
- Create: `supabase/functions/send-venue-digest/index.ts`
- Create: migration `supabase/migrations/20260609130000_schedule_venue_digest.sql` (pg_cron) — follow `20260601210000`'s `cron.schedule` + private-relocation pattern.

- [ ] **Step 1: Implement `send-venue-digest`** — for each active venue (respecting `org_notification_prefs` / `venue_scan_notification_pref` opt-outs): compute today's code; gather yesterday's check-ins, first-timers, rounds redeemed; send via Resend from `HappiTime <noreply@happitime.biz>`. **Subject (identical format daily, lock-screen scannable):** `Today's HappiTime code: {CODE} · {N} check-ins yesterday`. **Self-check:** if the run sends 0 emails while ≥1 venue is active, POST an admin alert (reliability is contractual).
- [ ] **Step 2: Schedule** — `cron.schedule('venue-digest', '0 11 * * *', ...)` = 11:00 UTC = 6:00 CT. **DST:** either compute "is it 6am CT?" inside the function and schedule it **hourly with a guard** (recommended — survives DST), or document the twice-yearly cron adjustment.
- [ ] **Step 3: Test** — unit-test subject formatting + the 0-email self-check trigger; manually invoke against seeded data and confirm one email per active venue with the right code/subject.
- [ ] **Step 4: Commit + deploy** (`supabase functions deploy send-venue-digest`; apply the cron migration).

---

## Phase 1 Acceptance (spec §4 — all must pass)

- [ ] A hardware-free venue sees today's code in **(a)** the console header, **(b)** the `/staff/[token]` URL, **(c)** the 6am email subject — all identical.
- [ ] A user **inside the geofence** checks in with the verbal code in **<10 seconds**.
- [ ] The **5th** check-in triggers a redeemable, **code-confirmed** buyback; the derived count resets.
- [ ] The GM can answer "how many **new faces** did HappiTime bring Mon–Wed?" from the stats page (first-timers vs returning).
- [ ] **Export** works (CSV of the venue's rows) — making the data clause true.

---

## Self-Review (completed)

- **Spec coverage:** §4.1 → Task 1; §4.2 → Task 2; §4.3 → Task 3; §4.4 → Task 5; §4.5 → Task 4; §4.6 → Task 6; §9.3 (nodemailer) → Task 0.2; §9.4 (drift) → Task 0.1. §3 locked decisions are encoded in Tasks 1–3 (charset, 6am shift, 1/venue/day unique, ≤3/day, employee exclusion, 5-attempt lockout, 2-lifetime fallback, stamp-not-discount). Out-of-scope §8 items excluded.
- **Open spec gaps to resolve during execution (flagged, not silently dropped):** the **base31 encoding** is loosely specified in the spec ("`encode_base31(...)[0:4]`"); this plan **locks a concrete definition** (per-byte `h[i]%31`) in Task 2 — confirm acceptable, since console/email/function all use the one lib so any definition is self-consistent. The **profanity denylist source** is a fill-in (Task 2). The §4.3 org-membership predicate must be matched exactly to `20260530221747` (Task 1 executor note).
- **Type consistency:** `serviceDate()` / `generateCheckinCode()` names are identical across TS and Deno; `{ stamps, stamps_to_next_round, is_first_visit }` return shape is consistent between Task 3 and the mobile hook in Task 5.

---

## Phases 2–4 — separate follow-on plans (do NOT bundle here)

- **Phase 2 (deep-link routing, spec §5):** add `linking` to mobile `NavigationContainer` (`happitime://venue/{slug}` → VenuePreview); small, unblocks scan→install→first-checkin attribution. → own plan.
- **Phase 3 (Toastmaker, spec §6):** `toastmaker_scores` view, nominee card + one-tap ratify, `venue_toastmakers` table, badge evolution, `?ref={handle}` attribution. → own plan.
- **Phase 4 (push triggers, spec §7):** ⚠️ **BLOCKED on a privacy decision** — `useVisitTracker.ts` already does background location (40m auto check-in, 2.5mi pings), which contradicts the "location only at check-in, never background" pitch. **Decide (a) strip background → manual/foreground (recommended for pilot) vs (b) opt-in proximity with a consent screen + revised pitch language** before any owner meeting quotes it. → own plan, after the decision.
