# Pilot Phase 5 — Insider Attribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Super Users a personal shareable code/QR (`@handle` + `https://happitime.biz/r/{handle}`) that credits them when new users sign up or save their shared itineraries, and roll those metrics up in the platform Super Admin console — including their effect on traffic to venues.

**Architecture:** Extends the committed Phase 2/3 plans, building on **one** person-grain referral spine (`user_referrals`) plus a new content-grain ledger (`super_user_credit_events`) for share-level itinerary saves. Referral writes go through a forge-proof `record_referral` RPC. A web route renders the branded QR PNG (reusing `@happitime/venue-qr`) so the mobile screen needs no new native module. The Super Admin console reads a `super_user_referral_summary` view now (referees + saves) and a Phase-1-gated `super_user_traffic_summary` view for check-in/venue metrics.

**Tech Stack:** Postgres (Supabase migrations) + `SECURITY DEFINER` RPCs; Next.js (`apps/directory` landing + QR route, `apps/web` admin console); React Native (`apps/mobile` onboarding step + Insider Code screen); the existing `@happitime/venue-qr` render module; `node --test` (Node 20).

**Spec:** `docs/superpowers/specs/2026-06-10-insider-attribution-design.md`.
**Prereq / coordination:** Builds on the Phase 3 capture foundation. This plan creates `user_referrals` + `record_referral` with idempotent (`if not exists` / `create or replace`) DDL, so it is safe whether it lands before or after the Phase 3 Toastmaker migration (which also uses `create table if not exists public.user_referrals`). The **traffic** view (Task 9) references `public.checkins` / `public.round_redemptions` and therefore only applies once **Phase 1 (PR #77) is deployed**.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/lib/parseReferralLink.mjs` (+`.d.ts`) | Pure parser: `/r/{handle}` + `happitime://referral/{handle}` → `{ handle }` |
| `apps/mobile/src/lib/parseVenueLink.mjs`, `parseItineraryLink.mjs` | Extend to also extract a `ref` query param |
| `supabase/migrations/20260610070000_user_referrals.sql` | `user_referrals` table (with `'code'` source) + `record_referral` RPC |
| `supabase/migrations/20260610071000_super_user_credit_events.sql` | `super_user_credit_events` ledger + extend `copy_shared_itinerary` to credit the sharer |
| `supabase/migrations/20260610072000_super_user_referral_summary.sql` | `super_user_referral_summary` view (referees + saves; no Phase 1 dep) |
| `supabase/migrations/20260610073000_super_user_traffic_summary.sql` | `super_user_traffic_summary` view (check-ins/venues/redemptions; **gated on Phase 1**) |
| `apps/mobile/src/lib/pendingReferral.ts` | Stash/resolve a `?ref`/handle captured before auth (mirrors `pendingVenueLink.ts`) |
| `apps/mobile/src/hooks/useReferralCapture.ts` | On first signed-in session, resolve a stashed handle → `record_referral` |
| `apps/mobile/src/constants/onboarding.ts` (+ `OnboardingScreen.tsx`) | Add a `'referrer'` step ("Who brought you?") |
| `packages/venue-qr/index.mjs` (+`.d.ts`) | Add `referralQrUrl(handle)` + `renderReferralQrPng(handle)` |
| `apps/directory/src/app/r/[handle]/page.tsx` | "Invited by @handle" landing (mirrors `/v/[slug]`) |
| `apps/directory/src/app/r/[handle]/qr/route.ts` | Branded QR PNG for the mobile Insider screen |
| `apps/mobile/src/screens/InsiderCodeScreen.tsx` | Super-User "My Insider Code": handle, link, QR `<Image>`, share, live count |
| `apps/directory/public/.well-known/apple-app-site-association`, `apps/mobile/app.json` | Add `/r/*` Universal Link + Android intent filter |
| `apps/web/src/app/admin/users/page.tsx`, `SuperUsersTable.tsx`, `[userId]/page.tsx` | Attribution columns + per-Insider breakdown |
| `test/*.test.mjs` | Parser unit tests + migration source-assertion tests + AASA test |

---

### Task 1: `?ref` parsing + `parseReferralLink` (pure functions, TDD)

**Files:**
- Create: `apps/mobile/src/lib/parseReferralLink.mjs` + `apps/mobile/src/lib/parseReferralLink.d.ts`
- Modify: `apps/mobile/src/lib/parseVenueLink.mjs`, `apps/mobile/src/lib/parseItineraryLink.mjs`
- Test: `test/parse-referral-link.test.mjs`, `test/parse-ref-param.test.mjs`

- [ ] **Step 1: Write the failing parser tests**

`test/parse-referral-link.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseReferralLink } from "../apps/mobile/src/lib/parseReferralLink.mjs";

test("parses https /r/{handle}", () => {
  assert.deepEqual(parseReferralLink("https://happitime.biz/r/jwill86"), { handle: "jwill86" });
  assert.deepEqual(parseReferralLink("https://happitime.biz/r/jwill86/"), { handle: "jwill86" });
});
test("parses custom scheme happitime://referral/{handle}", () => {
  assert.deepEqual(parseReferralLink("happitime://referral/jwill86"), { handle: "jwill86" });
});
test("rejects non-referral + malformed handles", () => {
  assert.equal(parseReferralLink("https://happitime.biz/v/some-bar"), null);
  assert.equal(parseReferralLink("https://happitime.biz/r/BAD HANDLE"), null);
  assert.equal(parseReferralLink(42), null);
});
```

`test/parse-ref-param.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseVenueLink } from "../apps/mobile/src/lib/parseVenueLink.mjs";
import { parseItineraryLink } from "../apps/mobile/src/lib/parseItineraryLink.mjs";

test("venue link extracts ref", () => {
  assert.deepEqual(
    parseVenueLink("https://happitime.biz/v/some-bar?src=qr&ref=jwill86"),
    { slug: "some-bar", src: "qr", ref: "jwill86" }
  );
  assert.equal(parseVenueLink("https://happitime.biz/v/some-bar").ref, null);
});
test("itinerary link extracts ref", () => {
  const token = "11111111-1111-1111-1111-111111111111";
  assert.deepEqual(
    parseItineraryLink(`https://happitime.biz/i/${token}?ref=jwill86`),
    { token, ref: "jwill86" }
  );
  assert.equal(parseItineraryLink(`https://happitime.biz/i/${token}`).ref, null);
});
```

- [ ] **Step 2: Run — Expected FAIL**

Run: `node --test test/parse-referral-link.test.mjs test/parse-ref-param.test.mjs`
Expected: FAIL (`parseReferralLink` not found; `ref` undefined).

- [ ] **Step 3: Implement `parseReferralLink.mjs`**

```js
// src/lib/parseReferralLink.mjs
// Pure parser for personal Insider referral links. Plain ESM (.mjs) with a
// colocated .d.ts so `node --test` can EXECUTE it on Node 20 while the app gets
// types. Matches https://happitime.biz/r/{handle} and happitime://referral/{handle}.
// Returns null for any non-referral URL or malformed handle.
export function parseReferralLink(url) {
  if (typeof url !== "string") return null;
  const base = url.split("?")[0];
  const match =
    base.match(/^https:\/\/(?:[a-z0-9-]+\.)?happitime\.biz\/r\/([^/?#]+)/i) ||
    base.match(/^happitime:\/\/referral\/([^/?#]+)/i);
  if (!match) return null;
  return normalizeHandle(match[1]);
}

// Handles are lowercase letters/numbers/underscore (see onboarding handle rules).
export function normalizeHandle(raw) {
  let h;
  try { h = decodeURIComponent(raw); } catch { h = raw; }
  h = h.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(h)) return null;
  return { handle: h };
}
```

`parseReferralLink.d.ts`:
```ts
export declare function parseReferralLink(url: unknown): { handle: string } | null;
export declare function normalizeHandle(raw: string): { handle: string } | null;
```

- [ ] **Step 4: Add `ref` extraction to the two existing parsers**

In `parseVenueLink.mjs`, before `return { slug, src };`, extract `ref` from `query` (same approach as `src`) and return `{ slug, src, ref }`:
```js
  const refMatch = query.match(/(?:^|&)ref=([^&]*)/i);
  let ref = null;
  if (refMatch) { try { ref = decodeURIComponent(refMatch[1]); } catch { ref = refMatch[1]; } }
  ref = ref && /^[a-z0-9_]{2,30}$/i.test(ref.replace(/^@/, "")) ? ref.replace(/^@/, "").toLowerCase() : null;
  return { slug, src, ref };
```
In `parseItineraryLink.mjs`, the `https` branch currently returns `normalize(httpsMatch[1])` (which returns `{ token }`). Extend `normalize` (and the custom-scheme branch) to also parse `rest` for `ref`: change the `https` branch to `return normalize(httpsMatch[1], rest)` and the custom-scheme branch's `return normalize(...)` likewise, and update `normalize(raw, rest = "")` to compute `ref` from `rest.split("#")[0]` with the same regex/sanitization as above, returning `{ token, ref }`.

- [ ] **Step 5: Run — Expected PASS.** `node --test test/parse-referral-link.test.mjs test/parse-ref-param.test.mjs`
- [ ] **Step 6:** `cd apps/mobile && npx tsc --noEmit` — clean.
- [ ] **Step 7: Commit**
```bash
git add apps/mobile/src/lib/parseReferralLink.* apps/mobile/src/lib/parseVenueLink.mjs apps/mobile/src/lib/parseItineraryLink.mjs test/parse-referral-link.test.mjs test/parse-ref-param.test.mjs
git commit -m "feat(pilot): referral link parsing (?ref + /r/{handle})"
```

---

### Task 2: Migration — `user_referrals` + forge-proof `record_referral` RPC

**Files:**
- Create: `supabase/migrations/20260610070000_user_referrals.sql`
- Test: `test/user-referrals-rls.test.mjs`

- [ ] **Step 1: Write the migration**

```sql
-- Person-grain referral spine: "who brought you" (one referrer per referee,
-- first-wins via PK). Shared with Phase 3 Toastmaker; idempotent DDL so either
-- migration may land first. Writes go ONLY through record_referral (forge-proof:
-- referee is derived from auth.uid()) or the server-side invite-claim path.
create table if not exists public.user_referrals (
  referee_user_id  uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_handle  text,
  source           text not null check (source in ('share','invite','code')),
  created_at       timestamptz not null default now(),
  check (referee_user_id <> referrer_user_id)
);
create index if not exists user_referrals_referrer_idx
  on public.user_referrals (referrer_user_id);

alter table public.user_referrals enable row level security;
-- A user may read their own referral edge (who referred them / whom they referred).
drop policy if exists "user_referrals_select_related" on public.user_referrals;
create policy "user_referrals_select_related" on public.user_referrals
  for select to authenticated
  using (referee_user_id = auth.uid() or referrer_user_id = auth.uid());
-- No client INSERT/UPDATE/DELETE policy: the only client write path is the RPC.
grant select on public.user_referrals to authenticated;

-- Forge-proof referral capture. referee is ALWAYS auth.uid(); a caller can only
-- ever set who referred THEM. First-wins via PK conflict. 'invite' is reserved
-- for the server-side claim path and rejected here.
create or replace function public.record_referral(
  p_referrer_handle text,
  p_source text default 'share'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_referrer uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_source not in ('share','code') then raise exception 'invalid source'; end if;

  select user_id into v_referrer
  from public.user_profiles
  where lower(handle) = lower(regexp_replace(p_referrer_handle, '^@', ''))
  limit 1;
  if v_referrer is null then return null; end if;        -- unknown handle: no-op
  if v_referrer = auth.uid() then return null; end if;    -- no self-referral

  insert into public.user_referrals (referee_user_id, referrer_user_id, referrer_handle, source)
  values (auth.uid(), v_referrer, lower(regexp_replace(p_referrer_handle, '^@', '')), p_source)
  on conflict (referee_user_id) do nothing;              -- first-wins
  return v_referrer;
end; $$;
revoke all on function public.record_referral(text, text) from public;
grant execute on function public.record_referral(text, text) to authenticated;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- drop function if exists public.record_referral(text, text);
-- drop table if exists public.user_referrals cascade;
```

- [ ] **Step 2: Write the source-assertion test** (mirrors `test/shared-itinerary-access.test.mjs`)

`test/user-referrals-rls.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20260610070000_user_referrals.sql", import.meta.url), "utf8");

test("user_referrals: select-only for related users, no client write policy", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select to authenticated[\s\S]*referee_user_id = auth\.uid\(\) or referrer_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(sql, /for insert[\s\S]*user_referrals/i); // writes via RPC only
});
test("record_referral is forge-proof: referee = auth.uid(), first-wins, no self-referral", () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /values \(auth\.uid\(\)/);                 // referee is the caller
  assert.match(sql, /on conflict \(referee_user_id\) do nothing/);
  assert.match(sql, /v_referrer = auth\.uid\(\) then return null/);
  assert.match(sql, /p_source not in \('share','code'\)/);    // 'invite' rejected
});
```

- [ ] **Step 3: Run — Expected FAIL** (migration file does not exist yet): `node --test test/user-referrals-rls.test.mjs`.
- [ ] **Step 4: Create the migration file (Step 1 content). Run — Expected PASS.**
- [ ] **Step 5: Apply locally** — `supabase db reset` (or `supabase migration up`) → succeeds with no error.
- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/20260610070000_user_referrals.sql test/user-referrals-rls.test.mjs
git commit -m "feat(db): user_referrals spine + forge-proof record_referral RPC"
```

---

### Task 3: Migration — `super_user_credit_events` + itinerary-save credit

**Files:**
- Create: `supabase/migrations/20260610071000_super_user_credit_events.sql`
- Test: `test/super-user-credit-events.test.mjs`

- [ ] **Step 1: Write the migration**

```sql
-- Content-grain attribution ledger for actions that DON'T fit the one-row-per-
-- referee user_referrals (a user can save many shared itineraries from many
-- Insiders). Currently: share-level itinerary saves. Append-only; writes happen
-- inside copy_shared_itinerary (SECURITY DEFINER), never from a client policy.
create table if not exists public.super_user_credit_events (
  id             uuid primary key default gen_random_uuid(),
  super_user_id  uuid not null references auth.users(id) on delete cascade,  -- the sharer
  actor_user_id  uuid not null references auth.users(id) on delete cascade,  -- who saved
  kind           text not null check (kind in ('itinerary_save')),
  subject_id     uuid not null,                                              -- source list id
  created_at     timestamptz not null default now(),
  check (super_user_id <> actor_user_id),
  unique (actor_user_id, subject_id)
);
create index if not exists super_user_credit_events_su_idx
  on public.super_user_credit_events (super_user_id, created_at desc);

alter table public.super_user_credit_events enable row level security;
drop policy if exists "suce_select_own" on public.super_user_credit_events;
create policy "suce_select_own" on public.super_user_credit_events
  for select to authenticated
  using (super_user_id = auth.uid() or public.is_happitime_admin());
-- No client write policy: written only inside copy_shared_itinerary / service-role.
grant select on public.super_user_credit_events to authenticated;

-- Extend the existing copy-a-shared-itinerary RPC: after the copy, if the source
-- list's owner is a super_user (and not the caller), record one credit event.
create or replace function public.copy_shared_itinerary(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_src_id uuid;
  v_src_owner uuid;
  v_name text;
  v_desc text;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select id, user_id, name, description
    into v_src_id, v_src_owner, v_name, v_desc
  from public.user_lists
  where share_token = p_token;

  if v_src_id is null then
    return null;  -- unknown / revoked token
  end if;

  insert into public.user_lists (user_id, name, description, visibility)
  values (v_uid, left(coalesce(v_name, 'Itinerary') || ' (saved)', 100), v_desc, 'private')
  returning id into v_new_id;

  insert into public.user_list_items (list_id, venue_id, sort_order, notes)
  select v_new_id, i.venue_id, i.sort_order, i.notes
  from public.user_list_items i
  where i.list_id = v_src_id;

  -- Share-level Insider credit (idempotent; never self-credit).
  if v_src_owner is not null and v_src_owner <> v_uid
     and exists (select 1 from public.user_profiles p
                 where p.user_id = v_src_owner and p.role = 'super_user') then
    insert into public.super_user_credit_events (super_user_id, actor_user_id, kind, subject_id)
    values (v_src_owner, v_uid, 'itinerary_save', v_src_id)
    on conflict (actor_user_id, subject_id) do nothing;
  end if;

  return v_new_id;
end;
$$;
revoke all on function public.copy_shared_itinerary(uuid) from public;
grant execute on function public.copy_shared_itinerary(uuid) to authenticated;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- (restore prior copy_shared_itinerary body from 20260609220000; )
-- drop table if exists public.super_user_credit_events cascade;
```

- [ ] **Step 2: Write the source-assertion test**

`test/super-user-credit-events.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20260610071000_super_user_credit_events.sql", import.meta.url), "utf8");

test("ledger: idempotent, never self-credit, select-own-or-admin, no client write", () => {
  assert.match(sql, /unique \(actor_user_id, subject_id\)/);
  assert.match(sql, /check \(super_user_id <> actor_user_id\)/);
  assert.match(sql, /super_user_id = auth\.uid\(\) or public\.is_happitime_admin\(\)/);
  assert.doesNotMatch(sql, /for insert[\s\S]*super_user_credit_events/i);
});
test("copy_shared_itinerary credits the sharer when owner is a super_user, not self", () => {
  assert.match(sql, /v_src_owner <> v_uid/);
  assert.match(sql, /role = 'super_user'/);
  assert.match(sql, /'itinerary_save', v_src_id/);
  assert.match(sql, /on conflict \(actor_user_id, subject_id\) do nothing/);
});
```

- [ ] **Step 3: Run — Expected FAIL**, then create the migration → **PASS**.
- [ ] **Step 4: Apply locally** — `supabase db reset` succeeds.
- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260610071000_super_user_credit_events.sql test/super-user-credit-events.test.mjs
git commit -m "feat(db): super_user_credit_events + share-level itinerary-save credit"
```

---

### Task 4: Migration — `super_user_referral_summary` view (referees + saves)

**Files:**
- Create: `supabase/migrations/20260610072000_super_user_referral_summary.sql`
- Test: `test/super-user-summary.test.mjs`

> No Phase 1 dependency — references only `user_profiles`, `user_referrals`, `super_user_credit_events`. This powers the admin console immediately.

- [ ] **Step 1: Write the migration**

```sql
-- Per-Insider rollup that needs no check-in tables (ships before Phase 1 deploys).
create or replace view public.super_user_referral_summary as
with su as (
  select user_id as super_user_id from public.user_profiles where role = 'super_user'
),
ref as (
  select referrer_user_id as super_user_id, count(*)::int as referees
  from public.user_referrals group by referrer_user_id
),
saves as (
  select super_user_id, count(*)::int as itinerary_saves
  from public.super_user_credit_events where kind = 'itinerary_save'
  group by super_user_id
)
select
  su.super_user_id,
  coalesce(ref.referees, 0)        as referees,
  coalesce(saves.itinerary_saves, 0) as itinerary_saves
from su
left join ref   on ref.super_user_id   = su.super_user_id
left join saves on saves.super_user_id = su.super_user_id;

-- Admin reads via service-role; also let an Insider read their own row.
alter view public.super_user_referral_summary set (security_invoker = on);
grant select on public.super_user_referral_summary to authenticated;
```

- [ ] **Step 2: Write the source-assertion test**

`test/super-user-summary.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20260610072000_super_user_referral_summary.sql", import.meta.url), "utf8");

test("referral summary aggregates referees + itinerary_saves per super_user, no checkin dep", () => {
  assert.match(sql, /create or replace view public\.super_user_referral_summary/);
  assert.match(sql, /referrer_user_id as super_user_id, count\(\*\)::int as referees/);
  assert.match(sql, /kind = 'itinerary_save'/);
  assert.doesNotMatch(sql, /public\.checkins/);          // must not depend on Phase 1
  assert.doesNotMatch(sql, /round_redemptions/);
});
```

- [ ] **Step 3: Run — FAIL → create migration → PASS.** `supabase db reset` succeeds.
- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260610072000_super_user_referral_summary.sql test/super-user-summary.test.mjs
git commit -m "feat(db): super_user_referral_summary view (referees + saves)"
```

---

### Task 5: Pending-referral stash + first-session capture

**Files:**
- Create: `apps/mobile/src/lib/pendingReferral.ts`, `apps/mobile/src/hooks/useReferralCapture.ts`
- Modify: the deep-link hooks that already see incoming URLs (`apps/mobile/src/hooks/useVenueLinkCapture.ts`) to stash a `ref`; `App.tsx` to mount `useReferralCapture`
- Test: `test/pending-referral.test.mjs`

- [ ] **Step 1: Write a failing unit test for the stash**

`test/pending-referral.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { setPendingReferral, takePendingReferral } from "../apps/mobile/src/lib/pendingReferral.ts";

test("stash returns once then clears", () => {
  assert.equal(takePendingReferral(), null);
  setPendingReferral("jwill86");
  assert.equal(takePendingReferral(), "jwill86");
  assert.equal(takePendingReferral(), null);
});
```
> Note: this `.ts` import runs under `node --test` only if the repo already transpiles test `.ts` (check how `test/` runs `.ts`; if Node can't import `.ts`, author `pendingReferral` as `.mjs` + `.d.ts` like `pendingVenueLink.ts`'s siblings and import the `.mjs`). Match whichever the repo's existing `.ts`-in-test convention is.

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `pendingReferral.ts`** (mirror `pendingVenueLink.ts`)
```ts
// src/lib/pendingReferral.ts
// Module-level stash for an Insider referral handle captured BEFORE the user is
// signed in (a ?ref param or a scanned /r/{handle} seen at the guest gate).
// Resolved on the first signed-in session by useReferralCapture → record_referral.
let pending: string | null = null;
export function setPendingReferral(handle: string): void { pending = handle.replace(/^@/, "").toLowerCase(); }
export function takePendingReferral(): string | null { const h = pending; pending = null; return h; }
```

- [ ] **Step 4: Implement `useReferralCapture.ts`**
```ts
// Resolves a stashed referral handle on the first signed-in session and records
// it server-side (forge-proof RPC; first-wins/idempotent). No-op when there's
// nothing stashed or no user. Runs once per signed-in session.
import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";          // match the app's client import
import { useCurrentUser } from "./useCurrentUser";    // match the app's auth hook
import { takePendingReferral } from "../lib/pendingReferral";

export function useReferralCapture(): void {
  const { user } = useCurrentUser();
  const done = useRef(false);
  useEffect(() => {
    if (!user || done.current) return;
    const handle = takePendingReferral();
    if (!handle) return;
    done.current = true;
    void supabase.rpc("record_referral", { p_referrer_handle: handle, p_source: "code" });
  }, [user]);
}
```
> Adjust `supabase`/`useCurrentUser` import paths to the app's actual modules (grep `useCurrentUser` / the supabase client). The capture hooks (`useVenueLinkCapture`, the venue/itinerary deep-link hooks) should call `setPendingReferral(parsed.ref)` whenever a parsed link carries a `ref`, and `setPendingReferral(parseReferralLink(url).handle)` for `/r/{handle}` URLs.

- [ ] **Step 5: Mount** `useReferralCapture()` in `App.tsx` (next to the existing root capture hooks). Wire `setPendingReferral` into `useVenueLinkCapture` and the itinerary/referral URL handlers.
- [ ] **Step 6:** `node --test test/pending-referral.test.mjs` PASS; `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 7: Commit**
```bash
git add apps/mobile/src/lib/pendingReferral.ts apps/mobile/src/hooks/useReferralCapture.ts apps/mobile/src/hooks/useVenueLinkCapture.ts apps/mobile/App.tsx test/pending-referral.test.mjs
git commit -m "feat(pilot): capture referrals on first session (?ref + /r links)"
```

---

### Task 6: "Who brought you?" onboarding step

**Files:**
- Create: `supabase/migrations/20260610074000_onboarding_step_referrer.sql`
- Modify: `apps/mobile/src/constants/onboarding.ts` (the `ONBOARDING_STEPS` array + `OnboardingStep` type), `apps/mobile/src/screens/OnboardingScreen.tsx`
- Test: `test/onboarding-referrer-step.test.mjs`

- [ ] **Step 1: Write the migration** (extend the CHECK constraint; the current allowed set is `welcome, location, preferences, notifications, handle, profile, complete` — see `20260518120000_super_users_and_guides.sql`)
```sql
alter table public.user_preferences
  drop constraint if exists user_preferences_onboarding_step_check;
alter table public.user_preferences
  add constraint user_preferences_onboarding_step_check
  check (onboarding_step in (
    'welcome','location','preferences','notifications','handle','profile','referrer','complete'
  ));
```

- [ ] **Step 2: Write the source-assertion + step-presence test**

`test/onboarding-referrer-step.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const mig = readFileSync(new URL("../supabase/migrations/20260610074000_onboarding_step_referrer.sql", import.meta.url), "utf8");
const consts = readFileSync(new URL("../apps/mobile/src/constants/onboarding.ts", import.meta.url), "utf8");

test("constraint admits the new referrer step", () => {
  assert.match(mig, /'profile','referrer','complete'/);
});
test("ONBOARDING_STEPS includes referrer before complete", () => {
  assert.match(consts, /"referrer"/);
});
```

- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Add `'referrer'` to `ONBOARDING_STEPS`** (ordered before `'complete'`) and to the `OnboardingStep` union. Add a step-copy entry in `OnboardingScreen.tsx`'s step map:
```ts
referrer: {
  icon: "at",
  title: "Who brought you?",
  body: "If a HappiTime Insider invited you, enter their @handle so they get credit. Skip if no one did.",
},
```
- [ ] **Step 5: Render the step UI** in `OnboardingScreen.tsx`: a single `@handle` text input (prefill from `takePendingReferral()` if present — but DON'T consume it if `useReferralCapture` already will; prefer reading a peeked copy), a **Skip** action, and on continue call `supabase.rpc("record_referral", { p_referrer_handle: value, p_source: "code" })` when non-empty. Reuse the existing handle-input styling from the `handle` step.
- [ ] **Step 6:** `node --test test/onboarding-referrer-step.test.mjs` PASS; `cd apps/mobile && npx tsc --noEmit` clean; `supabase db reset` succeeds.
- [ ] **Step 7: Commit**
```bash
git add supabase/migrations/20260610074000_onboarding_step_referrer.sql apps/mobile/src/constants/onboarding.ts apps/mobile/src/screens/OnboardingScreen.tsx test/onboarding-referrer-step.test.mjs
git commit -m "feat(pilot): 'who brought you?' onboarding step → record_referral"
```

---

### Task 7: Personal Insider QR — render module + web PNG route

**Files:**
- Modify: `packages/venue-qr/index.mjs` + `packages/venue-qr/index.d.ts`
- Create: `apps/directory/src/app/r/[handle]/qr/route.ts`
- Test: `test/referral-qr.test.mjs`

> Reuse the branded renderer; the mobile screen (Task 8 dependency) shows this PNG via `<Image>`, so no new RN native module / build is needed.

- [ ] **Step 1: Write the failing unit test**

`test/referral-qr.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { referralQrUrl, renderReferralQrPng } from "../packages/venue-qr/index.mjs";

test("referralQrUrl encodes the /r/{handle} landing", () => {
  assert.equal(referralQrUrl("jwill86", "https://happitime.biz"), "https://happitime.biz/r/jwill86");
});
test("renderReferralQrPng returns a PNG buffer", async () => {
  const png = await renderReferralQrPng("jwill86", { size: 300 });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png[0], 0x89); assert.equal(png[1], 0x50); // PNG magic
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Add to `packages/venue-qr/index.mjs`** (alongside `venueQrUrl`/`renderVenueQrPng`; factor the shared render so the branded "iTi" mark is identical):
```js
/** The public landing URL encoded into an Insider's personal referral QR. */
export function referralQrUrl(handle, base = DEFAULT_BASE) {
  return `${base.replace(/\/+$/, "")}/r/${encodeURIComponent(String(handle).replace(/^@/, "").toLowerCase())}`;
}
/** Render a branded referral QR PNG for a handle. Returns a PNG Buffer. */
export async function renderReferralQrPng(handle, opts = {}) {
  // Reuse the same branded-render path as renderVenueQrPng, encoding referralQrUrl.
  return renderBrandedQrPng(referralQrUrl(handle, opts.base), opts.size ?? 600);
}
```
If `renderVenueQrPng` currently inlines its render, extract a private `renderBrandedQrPng(url, size)` it and `renderReferralQrPng` both call (DRY — one branded renderer). Add the two new signatures to `index.d.ts`.

- [ ] **Step 4: Implement the web PNG route** `apps/directory/src/app/r/[handle]/qr/route.ts`:
```ts
import { NextRequest } from "next/server";
import { renderReferralQrPng } from "@happitime/venue-qr";

export const dynamic = "force-static"; // QR for a handle is stable; cache it
export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const clean = handle.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(clean)) return new Response("bad handle", { status: 400 });
  const png = await renderReferralQrPng(clean, { size: 600 });
  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, immutable" },
  });
}
```

- [ ] **Step 5:** `node --test test/referral-qr.test.mjs` PASS; `cd apps/directory && npx tsc --noEmit` clean.
- [ ] **Step 6: Commit**
```bash
git add packages/venue-qr/index.mjs packages/venue-qr/index.d.ts apps/directory/src/app/r/[handle]/qr/route.ts test/referral-qr.test.mjs
git commit -m "feat(pilot): branded Insider referral QR (render module + web PNG route)"
```

---

### Task 8: Web landing `/r/[handle]` + Insider Code screen + Universal Link

**Files:**
- Create: `apps/directory/src/app/r/[handle]/page.tsx`
- Create: `apps/mobile/src/screens/InsiderCodeScreen.tsx` (+ register in the navigator)
- Modify: `apps/directory/public/.well-known/apple-app-site-association`, `apps/mobile/app.json`
- Test: `test/aasa-referral-paths.test.mjs`

- [ ] **Step 1: Write the AASA test**

`test/aasa-referral-paths.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const aasa = JSON.parse(readFileSync(new URL("../apps/directory/public/.well-known/apple-app-site-association", import.meta.url), "utf8"));
const detail = aasa.applinks.details[0];

test("AASA covers itinerary, venue, and referral paths", () => {
  const comps = (detail.components ?? []).map((c) => c["/"]);
  assert.ok(comps.includes("/i/*"));
  assert.ok(comps.includes("/r/*"), "adds /r/*");
  assert.ok(detail.paths.includes("/r/*"));
});
```
> If Phase 2's `/v/*` AASA change has not merged yet, this test asserts only `/i/*` + `/r/*`; keep both `components` and the legacy `paths` array in sync.

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Add `/r/*` to the AASA** (extend `components` + `paths`; preserve any existing `/i/*` and `/v/*` entries):
```json
{ "/": "/r/*", "comment": "Insider referral links open in the app" }
```
And add the Android intent filter sibling in `apps/mobile/app.json` `android.intentFilters[0].data`:
```json
{ "scheme": "https", "host": "happitime.biz", "pathPrefix": "/r" }
```

- [ ] **Step 4: Implement the landing** `apps/directory/src/app/r/[handle]/page.tsx` — mirror `apps/directory/src/app/v/[slug]/page.tsx`: `force-dynamic`, `robots: noindex`, resolve the handle to a **public** `user_profiles` row (display_name, avatar) via the directory's query layer; `notFound()` if missing/private. Render "Join HappiTime — invited by @display_name" with App Store / Play buttons (`APP_STORE_URL`/`PLAY_STORE_URL` constants as in the venue landing) and an `appDeepLink = happitime://referral/{handle}` that a client snippet attempts to open. No `track-visit` call (referral capture happens in-app post-install).

- [ ] **Step 5: Implement `InsiderCodeScreen.tsx`** (gated to `role === 'super_user'`; hide/redirect otherwise):
  - Show `@handle`, the link `https://happitime.biz/r/{handle}`, the QR via `<Image source={{ uri: 'https://happitime.biz/r/' + handle + '/qr' }} style={{ width: 240, height: 240 }} />`.
  - A **Share** button → `Share.share({ message: 'Join me on HappiTime: https://happitime.biz/r/' + handle })`.
  - A live count: `select count(*) from user_referrals where referrer_user_id = me` (the user's own rows are readable per Task 2 RLS) → "You've brought N people."
  - Register the screen in the navigator and add an entry point (e.g. a row on the profile/Activity screen visible only to Super Users).

- [ ] **Step 6:** `node --test test/aasa-referral-paths.test.mjs` PASS; `cd apps/directory && npx tsc --noEmit` and `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 7: Commit**
```bash
git add apps/directory/src/app/r/[handle]/page.tsx apps/mobile/src/screens/InsiderCodeScreen.tsx apps/directory/public/.well-known/apple-app-site-association apps/mobile/app.json test/aasa-referral-paths.test.mjs
git commit -m "feat(pilot): Insider /r landing + My Insider Code screen + /r Universal Link"
```

> **Delivery note:** the `app.json` intent-filter change is NATIVE — it takes effect only in a NEW build (rides the next store build). The AASA change is a Vercel deploy. Do NOT OTA `app.json`.

---

### Task 9: Super Admin attribution dashboard

**Files:**
- Modify: `apps/web/src/app/admin/users/page.tsx`, `apps/web/src/app/admin/users/SuperUsersTable.tsx`, `apps/web/src/app/admin/users/[userId]/page.tsx`
- Create (gated migration): `supabase/migrations/20260610073000_super_user_traffic_summary.sql`
- Test: `test/admin-insider-attribution.test.mjs`

- [ ] **Step 1: Write the gated traffic-summary migration** (applies only once Phase 1's `checkins`/`round_redemptions` exist)
```sql
-- Per-Insider venue-traffic rollup. References Phase 1 tables; APPLY ONLY AFTER
-- Phase 1 (PR #77: checkins, round_redemptions) is deployed.
create or replace view public.super_user_traffic_summary as
with first_visits as (        -- each referee's FIRST check-in per venue, credited to referrer
  select r.referrer_user_id as super_user_id,
         count(*)::int as first_checkins_driven,
         count(distinct fv.venue_id)::int as venues_touched
  from (select venue_id, user_id, min(created_at) as first_at
        from public.checkins group by venue_id, user_id) fv
  join public.user_referrals r on r.referee_user_id = fv.user_id
  group by r.referrer_user_id
),
redemptions as (
  select r.referrer_user_id as super_user_id, count(*)::int as redemptions_driven
  from public.round_redemptions rr
  join public.user_referrals r on r.referee_user_id = rr.user_id
  group by r.referrer_user_id
)
select
  coalesce(f.super_user_id, d.super_user_id) as super_user_id,
  coalesce(f.first_checkins_driven, 0)       as first_checkins_driven,
  coalesce(f.venues_touched, 0)              as venues_touched,
  coalesce(d.redemptions_driven, 0)          as redemptions_driven
from first_visits f
full join redemptions d on d.super_user_id = f.super_user_id;

alter view public.super_user_traffic_summary set (security_invoker = on);
grant select on public.super_user_traffic_summary to authenticated;
```

- [ ] **Step 2: Write the admin test**

`test/admin-insider-attribution.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync(new URL("../apps/web/src/app/admin/users/page.tsx", import.meta.url), "utf8");
const traffic = readFileSync(new URL("../supabase/migrations/20260610073000_super_user_traffic_summary.sql", import.meta.url), "utf8");

test("admin users page reads the referral summary view", () => {
  assert.match(page, /super_user_referral_summary/);
});
test("traffic view is gated (references Phase 1 tables) and credits referrers", () => {
  assert.match(traffic, /public\.checkins/);
  assert.match(traffic, /public\.round_redemptions/);
  assert.match(traffic, /r\.referee_user_id = fv\.user_id/);
});
```

- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Wire the admin reads.** In `apps/web/src/app/admin/users/page.tsx` (service-role `db`), after loading profiles, fetch `super_user_referral_summary` (always) and `super_user_traffic_summary` **guarded** — only query it when the relation exists, so the page works pre-Phase-1:
```ts
const { data: refRows } = await db.from('super_user_referral_summary').select('*');
let trafficRows: any[] = [];
const { data: t } = await db.from('super_user_traffic_summary').select('*');
if (t) trafficRows = t; // null/error when the gated view isn't deployed yet → columns show "—"
```
Build a `Map` by `super_user_id` and pass `referees`, `itinerary_saves`, and (when present) `first_checkins_driven`, `venues_touched`, `redemptions_driven` onto each `SuperUserRow`.

- [ ] **Step 5: Extend `SuperUserRow` + `SuperUsersTable.tsx`** with the new optional fields and render columns: **Brought** (referees), **First check-ins**, **Saves**, **Venues** — render `—` when a traffic field is `undefined`.

- [ ] **Step 6: Per-Insider breakdown** in `apps/web/src/app/admin/users/[userId]/page.tsx`: show the five numbers and, for "effect on traffic," a per-venue list — query first check-ins by this Insider's referees grouped by venue (join `checkins` → `user_referrals` → `venues`, guarded by `to_regclass('public.checkins')`/try-catch so it no-ops pre-Phase-1).

- [ ] **Step 7:** `node --test test/admin-insider-attribution.test.mjs` PASS; `cd apps/web && npx tsc --noEmit` clean. Apply the gated migration locally only if `checkins`/`round_redemptions` exist in the local DB; otherwise skip and note it applies post-Phase-1.

- [ ] **Step 8: Commit**
```bash
git add apps/web/src/app/admin/users/page.tsx apps/web/src/app/admin/users/SuperUsersTable.tsx apps/web/src/app/admin/users/[userId]/page.tsx supabase/migrations/20260610073000_super_user_traffic_summary.sql test/admin-insider-attribution.test.mjs
git commit -m "feat(web): Super Admin Insider attribution dashboard (referees, saves, venue traffic)"
```

---

## Phase 5 Acceptance

- [ ] A Super User can open **My Insider Code** and see their `@handle`, link, and a branded QR.
- [ ] A new user who enters/scans an Insider's handle gets a `user_referrals` row (`source='code'`, first-wins, forge-proof) — verified via the onboarding step and the `record_referral` RPC.
- [ ] Saving an itinerary a Super User shared writes exactly one `super_user_credit_events` row (idempotent, never self-credit).
- [ ] The Super Admin console (`admin/users`) shows per-Insider **referees** and **itinerary saves** immediately; **first check-ins / venues touched / redemptions** light up once Phase 1 (`checkins`/`round_redemptions`) is deployed and the gated traffic view is applied.
- [ ] `happitime.biz/.well-known/apple-app-site-association` serves `/r/*`; a new build opens `/r/{handle}` in-app.

## Self-Review

- **Spec coverage:** §4.0 foundation → Tasks 1,2,5,6; §4.A personal QR/landing → Tasks 7,8; §4.C itinerary-save credit → Task 3; §4.B admin dashboard → Tasks 4,9. AASA/intent-filter (§4.A) → Task 8. Testing (§7) → source-assertion + parser/unit tests in each task.
- **Two-grain split preserved:** `user_referrals` (person, Task 2) is never written for saves; saves go to `super_user_credit_events` (content, Task 3). The summary views union them (Tasks 4, 9).
- **Phase 1 dependency isolated:** only Task 9's `super_user_traffic_summary` + the per-venue breakdown reference `checkins`/`round_redemptions`; everything else ships without Phase 1. Admin reads are guarded so the page works pre-deploy.
- **Forge-proofing:** the only client referral write path is `record_referral` (referee = `auth.uid()`), asserted by Task 2's test.
- **No new native module:** QR is a server-rendered PNG shown via `<Image>` (Task 7/8) — `@happitime/venue-qr` stays Node-side; OTA-safe except the `app.json` intent filter (flagged native, rides the next build).
- **Name consistency:** `record_referral(p_referrer_handle, p_source)`, `super_user_credit_events(super_user_id, actor_user_id, kind, subject_id)`, views `super_user_referral_summary` / `super_user_traffic_summary`, `referralQrUrl`/`renderReferralQrPng`, `setPendingReferral`/`takePendingReferral` are used identically across tasks.
- **Coordination flag:** Tasks 2/3 use idempotent DDL so landing before/after the Phase 3 Toastmaker migration is safe (both `create table if not exists public.user_referrals`); if Phase 3 already added `user_referrals` with `source check ('share','invite')`, reconcile the `'code'` value (alter the constraint) — note in the Task 2 PR.
