# Pilot Phase 3 — Toastmaker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize each venue's top traffic-bringer ("Toastmaker"): track who referred whom, score referrers per venue over a rolling 90 days, surface a one-tap GM ratify card in the console, and display the ratified Toastmaker in the app/directory/digest with an evolved badge.

**Architecture:** A `user_referrals` table records "who brought you" (captured from `?ref={handle}` share/venue links and from claimed friend invites). A `toastmaker_scores` SQL **view** derives, per (venue, candidate user) over 90 days, `own check-ins` + `attributed first-visits` + `attributed redemptions` → an eligibility floor + a score. The GM ratifies a nominee (writes `venue_toastmakers`); display reads the ratified row. Scoring accrues continuously; ratification is quarterly and manual.

**Tech Stack:** Postgres (Supabase migrations) + `SECURITY DEFINER` RPCs, Next.js console (`apps/web`) + directory (`apps/directory`), React Native (`apps/mobile`, evolve `SuperUserBadge`), the `send-venue-digest` edge function (Phase 1).

**Spec:** `PILOT_BUILD_SPEC.md` §6. **Prereq:** Phase 1 merged + deployed (`checkins`, `round_redemptions` live). Build AFTER Phase 2.

> **⚠️ DECISIONS LOCKED HERE — confirm before building (spec §6 is loose on these):**
> 1. **One referrer per referee, first-wins** (a `?ref` link or invite claim sets it once; later refs ignored).
> 2. **"attributed" (eligibility floor ≥3)** = distinct referees whose FIRST check-in *at this venue* landed in the 90d window and whose referrer = the candidate.
> 3. **"attributed_redemptions" (score ×3)** = `round_redemptions` at this venue in 90d by the candidate's referees.
> 4. **Score** = `attributed_redemptions×3 + own_checkins×1`; **eligible** = `own_checkins ≥ 6 AND attributed_first_visits ≥ 3`.
> 5. **"quarter"** = calendar quarter string `YYYY-Q#` of the ratification date; one Toastmaker per (venue, quarter).
> If J wants different weights/floors, change them ONLY in Task 2's view + Task 3's constants.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260610060000_toastmaker.sql` | `user_referrals` + `venue_toastmakers` tables + RLS + `toastmaker_scores` view + `ratify_toastmaker`/`pass_toastmaker` RPCs |
| `supabase/functions/_shared/quarter.ts` + `packages/shared-api/src/checkin/quarter.mjs` (+`.d.ts`) | `currentQuarter(date) → "YYYY-Q#"` (shared, anti-drift, like the checkin code lib) |
| `apps/mobile/src/lib/pendingReferral.ts` | stash/resolve a `?ref` handle captured before signup |
| referral capture: extend `useVenueDeepLink` / `useItineraryDeepLink` / claim flow | record `user_referrals` on first authed session |
| share-URL builders (`FavoritesScreen.handleShareOutside`, the `/v` QR links) | append `?ref={my_handle}` |
| `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx` | Toastmaker nominee card (Approve / Pass) |
| `apps/web/src/app/api/venues/[venueId]/toastmaker/route.ts` | org-authed nominee fetch + ratify/pass actions |
| `apps/mobile/src/components/SuperUserBadge.tsx` | add a `toastmaker` variant (raised-glass glyph) |
| venue display (app `VenuePreviewScreen`, directory `kc/[neighborhood]/[slug]`) | "Toastmaker: @handle" line |
| `supabase/functions/send-venue-digest/index.ts` | add the Toastmaker line to the email |

---

### Task 1: Shared `currentQuarter` helper (TS + Deno, anti-drift)

**Files:**
- Create: `packages/shared-api/src/checkin/quarter.mjs` + `quarter.d.ts`, `supabase/functions/_shared/quarter.ts`
- Test: `test/quarter.test.mjs` (Node) + `supabase/functions/_shared/quarter.test.ts` (Deno)

- [ ] **Step 1: Write the Node test**

`test/quarter.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { currentQuarter } from "../packages/shared-api/src/checkin/quarter.mjs";

test("maps months to YYYY-Q#", () => {
  assert.equal(currentQuarter(new Date("2026-01-15T12:00:00Z")), "2026-Q1");
  assert.equal(currentQuarter(new Date("2026-04-01T12:00:00Z")), "2026-Q2");
  assert.equal(currentQuarter(new Date("2026-09-30T12:00:00Z")), "2026-Q3");
  assert.equal(currentQuarter(new Date("2026-12-31T12:00:00Z")), "2026-Q4");
});
```

- [ ] **Step 2: Run — Expected FAIL** (`node --test test/quarter.test.mjs`).
- [ ] **Step 3: Implement** `packages/shared-api/src/checkin/quarter.mjs`:
```js
export function currentQuarter(date) {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}
```
plus `quarter.d.ts` (`export declare function currentQuarter(date: Date): string;`) and a Deno mirror `supabase/functions/_shared/quarter.ts` (identical, TS export). Add a Deno test importing it that asserts the same 4 cases.
- [ ] **Step 4: Run both — Expected PASS** (`node --test test/quarter.test.mjs`; `deno test --no-config supabase/functions/_shared/quarter.test.ts`).
- [ ] **Step 5: Commit** `git commit -m "feat(pilot): shared currentQuarter helper (TS + Deno)"`.

> SQL uses `to_char(now(),'YYYY') || '-Q' || extract(quarter from now())` — same definition; the view (Task 2) and the RPC (Task 3) both compute it in SQL, the helper is for TS/Deno display.

---

### Task 2: Schema — referrals, toastmaker table, scores view, ratify RPCs

**Files:**
- Create: `supabase/migrations/20260610060000_toastmaker.sql`
- Test: `test/toastmaker-rls.test.mjs` (local-DB persona test, same harness as `test/pilot-checkin-rls.test.mjs`)

- [ ] **Step 1: Write the migration**

```sql
-- Who referred whom (one referrer per referee, first-wins via PK).
create table if not exists public.user_referrals (
  referee_user_id  uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_handle  text,
  source           text not null check (source in ('share','invite')),
  created_at       timestamptz not null default now(),
  check (referee_user_id <> referrer_user_id)
);
create index if not exists user_referrals_referrer_idx on public.user_referrals (referrer_user_id);

-- Ratified Toastmaker per venue per quarter.
create table if not exists public.venue_toastmakers (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  quarter     text not null,                       -- 'YYYY-Q#'
  ratified_by uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (venue_id, quarter)
);
create index if not exists venue_toastmakers_venue_idx on public.venue_toastmakers (venue_id);

alter table public.user_referrals enable row level security;
alter table public.venue_toastmakers enable row level security;
-- user_referrals: a user may read their own referral edge (who referred them, who they referred).
create policy "user_referrals_select_related" on public.user_referrals for select to authenticated
  using (referee_user_id = auth.uid() or referrer_user_id = auth.uid());
-- venue_toastmakers: world-readable for authenticated (it's a public honor); writes via RPC only.
create policy "venue_toastmakers_select_all" on public.venue_toastmakers for select to authenticated using (true);
grant select on public.user_referrals, public.venue_toastmakers to authenticated;

-- Per (venue, candidate) rolling-90d scoring.
create or replace view public.toastmaker_scores as
with own as (
  select c.venue_id, c.user_id, count(*) as own_checkins
  from public.checkins c
  where c.created_at > now() - interval '90 days'
  group by c.venue_id, c.user_id
),
first_visits as (   -- each referee's FIRST check-in per venue, within 90d
  select fv.venue_id, r.referrer_user_id as user_id, count(*) as attributed_first_visits
  from (
    select venue_id, user_id, min(created_at) as first_at
    from public.checkins group by venue_id, user_id
  ) fv
  join public.user_referrals r on r.referee_user_id = fv.user_id
  where fv.first_at > now() - interval '90 days'
  group by fv.venue_id, r.referrer_user_id
),
redemptions as (    -- referees' redemptions per venue within 90d
  select rr.venue_id, r.referrer_user_id as user_id, count(*) as attributed_redemptions
  from public.round_redemptions rr
  join public.user_referrals r on r.referee_user_id = rr.user_id
  where rr.created_at > now() - interval '90 days'
  group by rr.venue_id, r.referrer_user_id
)
select
  coalesce(o.venue_id, f.venue_id, d.venue_id)  as venue_id,
  coalesce(o.user_id,  f.user_id,  d.user_id)   as user_id,
  coalesce(o.own_checkins, 0)                   as own_checkins,
  coalesce(f.attributed_first_visits, 0)        as attributed_first_visits,
  coalesce(d.attributed_redemptions, 0)         as attributed_redemptions,
  coalesce(d.attributed_redemptions,0)*3 + coalesce(o.own_checkins,0)*1 as score,
  (coalesce(o.own_checkins,0) >= 6 and coalesce(f.attributed_first_visits,0) >= 3) as eligible
from own o
full join first_visits f on f.venue_id=o.venue_id and f.user_id=o.user_id
full join redemptions  d on d.venue_id=coalesce(o.venue_id,f.venue_id) and d.user_id=coalesce(o.user_id,f.user_id);

-- Top eligible nominee for a venue (org-gated read).
create or replace function public.toastmaker_nominee(p_venue_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when s.user_id is null then null else jsonb_build_object(
    'user_id', s.user_id, 'handle', p.handle, 'display_name', p.display_name,
    'own_checkins', s.own_checkins, 'attributed_first_visits', s.attributed_first_visits,
    'attributed_redemptions', s.attributed_redemptions, 'score', s.score
  ) end
  from public.toastmaker_scores s
  left join public.user_profiles p on p.user_id = s.user_id
  where s.venue_id = p_venue_id and s.eligible
    and exists (select 1 from public.venues v join public.org_members m on m.org_id=v.org_id
                where v.id = p_venue_id and m.user_id = auth.uid())   -- caller is org member
  order by s.score desc, s.own_checkins desc
  limit 1;
$$;
revoke all on function public.toastmaker_nominee(uuid) from public;
grant execute on function public.toastmaker_nominee(uuid) to authenticated;

-- GM ratifies: insert venue_toastmakers for the current quarter (org-gated).
create or replace function public.ratify_toastmaker(p_venue_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_q text := to_char(now(),'YYYY') || '-Q' || extract(quarter from now())::int;
begin
  if not exists (select 1 from public.venues v join public.org_members m on m.org_id=v.org_id
                 where v.id=p_venue_id and m.user_id=auth.uid()) then
    raise exception 'not authorized';
  end if;
  insert into public.venue_toastmakers (venue_id, user_id, quarter, ratified_by)
  values (p_venue_id, p_user_id, v_q, auth.uid())
  on conflict (venue_id, quarter) do update set user_id=excluded.user_id, ratified_by=excluded.ratified_by, created_at=now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.ratify_toastmaker(uuid, uuid) from public;
grant execute on function public.ratify_toastmaker(uuid, uuid) to authenticated;
```

- [ ] **Step 2: Write the RLS persona test** (`test/toastmaker-rls.test.mjs`, copying the `test/pilot-checkin-rls.test.mjs` docker-psql harness): assert (a) a user reads their own `user_referrals` row, a stranger does not; (b) `venue_toastmakers` is readable by any authenticated user; (c) `ratify_toastmaker` inserts when the caller is the venue's org member and raises `not authorized` otherwise; (d) `toastmaker_scores` returns the expected score for a seeded venue with 6 own check-ins + 3 referred first-visits + 1 referred redemption → `score = 1*3 + 6 = 9`, `eligible = true`.
- [ ] **Step 3:** `supabase db reset` then `node --test test/toastmaker-rls.test.mjs` → PASS.
- [ ] **Step 4: Commit** `git commit -m "feat(db): toastmaker referrals + scores view + ratify RPCs"`.

---

### Task 3: Referral capture (`?ref={handle}` + invite claim → `user_referrals`)

**Files:**
- Create: `apps/mobile/src/lib/pendingReferral.ts` (stash like `pendingVenueLink.ts`)
- Modify: `apps/mobile/src/lib/parseItineraryLink.mjs` + `parseVenueLink.mjs` to also extract a `ref` query param
- Modify: the share-URL builders to append `?ref={my_handle}` — `apps/mobile/src/screens/FavoritesScreen.tsx#handleShareOutside` (itinerary link) and the `/v/{slug}` QR/share links
- Modify: the auth/first-session flow (where `useCurrentUser` first resolves a signed-in user) to resolve a stashed ref handle → `user_id` and `insert user_referrals` (idempotent on PK)
- Migration addendum: on `pending_friend_invites` claim, insert `user_referrals(referee=claimer, referrer=inviter_id, source='invite')` — add this to the existing invite-claim path (find where `claimed_at` is set)
- Test: `test/parse-ref-param.test.mjs`

- [ ] **Step 1: Write the failing parser test** asserting `parseItineraryLink("https://happitime.biz/i/<uuid>?ref=jwill86")` returns `{ token, ref: "jwill86" }` and venue links likewise; no-ref → `ref: null`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the `ref` extraction in both parsers (uuid/slug validation unchanged; `ref` = sanitized handle or null).
- [ ] **Step 4:** Append `?ref={my_handle}` in `handleShareOutside` (read the sharer's handle from `useCurrentUser`/profile) and in the venue share/QR URL builder.
- [ ] **Step 5: Capture** — in `pendingReferral.ts`, stash a ref handle seen by the deep-link hooks before auth; on first signed-in session, resolve handle→user_id (via `user_profiles`) and `supabase.from('user_referrals').insert({ referee_user_id, referrer_user_id, referrer_handle, source:'share' })` (ignore PK-conflict = already referred). Wire the invite-claim path to insert `source:'invite'` from `inviter_id`.
- [ ] **Step 6:** `node --test test/parse-ref-param.test.mjs` PASS; `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 7: Commit** `git commit -m "feat(pilot): capture referrals from ?ref links + invite claims"`.

> **Decision flag:** referral is written client-side on first session (PK makes it idempotent/first-wins). If J wants it forged-proof, move the insert into a `SECURITY DEFINER` `record_referral(p_referrer_handle)` RPC that sets `referee = auth.uid()` server-side — recommended for GA, optional for pilot.

---

### Task 4: Console — Toastmaker nominee card (Approve / Pass)

**Files:**
- Create: `apps/web/src/app/api/venues/[venueId]/toastmaker/route.ts` — GET → `toastmaker_nominee(venueId)`; POST `{ action:'ratify'|'pass', user_id }` → `ratify_toastmaker` or records a pass. Org-auth via the same helper Task-4-of-Phase-1 used for `checkin-code`.
- Modify: `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx` — render a "Toastmaker nominee" card (gated to `canManageVenue`): name, handle, the three numbers + score, and **Approve** / **Pass** buttons. Show the current ratified Toastmaker if one exists this quarter.

- [ ] **Step 1:** Route test (existing `apps/web` route-test pattern): org member GET returns the nominee shape (or null); non-member → 403; POST ratify by a member writes `venue_toastmakers` (assert via service-role read); POST by non-member → 403.
- [ ] **Step 2:** Implement the route. Run test → PASS.
- [ ] **Step 3:** Add the card to the venue page (follow the existing stats-tab/card pattern from Phase 1 Task 4). `cd apps/web && npx tsc --noEmit` clean.
- [ ] **Step 4: Commit** `git commit -m "feat(web): Toastmaker nominee card + ratify/pass"`.

> "Pass" semantics (decision flag): simplest = a client-remembered dismissal for the quarter (no table). If J wants a persistent veto, add a `toastmaker_passes` table — deferred unless requested.

---

### Task 5: Display — badge + venue line (app, directory, digest)

**Files:**
- Modify: `apps/mobile/src/components/SuperUserBadge.tsx` — add a `variant="toastmaker"` (raised-glass glyph; keep the existing super_user wine-circle).
- Modify: `apps/mobile/src/screens/VenuePreviewScreen.tsx` — if the venue has a current-quarter `venue_toastmakers` row, show "🥂 Toastmaker: @handle" with the badge.
- Modify: `apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx` — same "Toastmaker: @handle" line (server read).
- Modify: `supabase/functions/send-venue-digest/index.ts` — add a digest line "This quarter's Toastmaker: @handle" when set.

- [ ] **Step 1:** Badge variant — add the glyph + a snapshot/source-assertion test if the repo has one for SuperUserBadge; else `tsc` + a visual check.
- [ ] **Step 2:** App venue line — read `venue_toastmakers` for the current quarter (a small hook or join in the existing venue fetch). `tsc` clean.
- [ ] **Step 3:** Directory line — server component read. `cd apps/directory && npx tsc --noEmit` clean.
- [ ] **Step 4:** Digest line — extend the per-venue email body; add a unit test for the formatter line. `deno test --no-config supabase/functions/send-venue-digest/ --allow-read` green.
- [ ] **Step 5: Commit** per surface.

---

### Task 6: Pilot hand-pick shortcut (docs + manual path)

**Files:**
- Modify: `docs/autotag-verification-process.md`-style note OR a short `docs/pilot-toastmaker-runbook.md`

- [ ] **Step 1:** Document the GM-blessing shortcut: insert the first Toastmaker manually per pilot venue —
```sql
select public.ratify_toastmaker('<venue_id>', '<user_id>');  -- run as the GM's session, or service-role with an explicit ratified_by
```
Note that `toastmaker_scores` accrues underneath and the console card takes over at the first quarterly review. No code — a runbook entry.
- [ ] **Step 2: Commit** `git commit -m "docs(pilot): toastmaker hand-pick runbook"`.

---

## Phase 3 Acceptance (spec §6)
- [ ] A referred user's first check-in at a venue credits their referrer in `toastmaker_scores`.
- [ ] The console shows the top eligible nominee (name/handle/numbers) with one-tap **Approve**; approval writes `venue_toastmakers` for the quarter.
- [ ] The ratified Toastmaker shows on the app venue screen, the directory venue page, the profile badge, and the digest email.
- [ ] The first Toastmaker can be hand-picked per the runbook; scoring accrues underneath.

## Self-Review
- **Spec §6 coverage:** `toastmaker_scores` view → Task 2; `?ref` attribution → Tasks 2+3; nominee card Approve/Pass → Task 4; `venue_toastmakers` table → Task 2; display (venue app+directory, badge, digest) → Task 5; pilot hand-pick → Task 6. **Locked decisions flagged** at the top + inline (scoring weights/floors in Task 2; referral forge-proofing in Task 3; "Pass" persistence in Task 4).
- **Placeholders:** none — concrete SQL/tests throughout; UI tasks reference the exact existing patterns built in Phase 1 Task 4 + `SuperUserBadge`.
- **Type/name consistency:** `toastmaker_scores` columns (`own_checkins`, `attributed_first_visits`, `attributed_redemptions`, `score`, `eligible`) are consumed identically by `toastmaker_nominee` (Task 2), the console route (Task 4); `currentQuarter`/SQL-quarter share one definition (Task 1); `user_referrals`/`venue_toastmakers` shapes are stable across tasks.
- **Dependency:** requires Phase 1 (`checkins`/`round_redemptions`) live; build after Phase 2.
