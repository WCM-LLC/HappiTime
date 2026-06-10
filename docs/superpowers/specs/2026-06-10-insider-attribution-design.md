# Insider Attribution — Design Spec

**Date:** 2026-06-10
**Status:** Approved (brainstorm) — ready for implementation plan
**Phase:** Pilot Phase 5 — extends Phase 2 (deep-link attribution) + Phase 3 (Toastmaker)
**Companion docs:** `PILOT_BUILD_SPEC.md` §5–6, `docs/superpowers/plans/2026-06-10-pilot-phase-3-toastmaker.md`, `docs/superpowers/plans/2026-06-10-pilot-phase-2-deeplink-attribution.md`

---

## 1. Goal

Give Super Users ("HappiTime Insiders") a **personal shareable code/QR they pull up on their phone** so that when new users sign up or act on it, the credit **adds up in the platform Super Admin console** — including a per-Insider view of **their effect on traffic to venues**. Extend the same attribution to **itinerary saves**.

This is an **extension of already-committed plans**, not a new subsystem. The person-grain referral spine (`user_referrals`) and the `?ref={handle}` capture are defined in the Phase 3 Toastmaker plan; this spec builds three deltas on that spine and does not introduce a parallel referral table.

## 2. Locked decisions (from brainstorm)

1. **Build by extending the committed Phase 2/3 plans** — one `user_referrals` spine, no duplication.
2. **Metrics roll up in the platform Super Admin console** (`apps/web/src/app/admin/users`), not the GM/venue console.
3. **Itinerary saves credit the sharer (share-level)** — the Super User who shared the itinerary, not "the referee's referrer."
4. **Cold-install capture via a "Who brought you? @___" onboarding step** — not best-effort warm-path-only, and not a paid deferred-deep-link provider (Branch/Adjust out of scope for pilot).
5. **Capture is forge-proof** — referral writes go through a `SECURITY DEFINER record_referral` RPC that derives `referee` from `auth.uid()` server-side (upgrades Phase 3's "optional for pilot" client-side insert).
6. **Personal "code" = the Super User's `@handle`** — no new vanity-code table (YAGNI). The QR encodes `https://happitime.biz/r/{handle}`.

## 3. Architecture — one spine, two grains

Attribution lives at two distinct cardinalities. Conflating them is the central design trap:

| Grain | Table | Cardinality | Powers |
|---|---|---|---|
| **Person** | `user_referrals` (Phase 3) | one referrer per referee, first-wins | referee counts; all Toastmaker scoring (first check-ins, redemptions) |
| **Content** | `super_user_credit_events` (new) | many per user, per piece of content | share-level itinerary saves |

A user can save several itineraries from several Super Users, so itinerary saves **cannot** live in the one-row-per-referee `user_referrals`. They need their own append-only event ledger. The Super Admin dashboard reads **both** and unions them into a per-Insider summary — leaving `user_referrals` untouched as the Toastmaker spine.

The full attribution map ("all the ways an Insider's effect is measured"):

| # | Attributable action | Metric | Source |
|---|---|---|---|
| 1 | New user signs up via code/QR/link | `referees` | `user_referrals` |
| 2 | A referee's **first check-in** at a venue | `first_checkins_driven`, `venues_touched` | `checkins` ⨝ `user_referrals` |
| 3 | A referee redeems a **Round** | `redemptions_driven` | `round_redemptions` ⨝ `user_referrals` |
| 4 | A new user **saves a shared itinerary** | `itinerary_saves` | `super_user_credit_events` |
| 5 | Published guides / engagement | (already in admin console) | `guides` |

---

## 4. Components

### 4.0 Shared capture foundation (co-owned with Phase 3)

Built once; both Toastmaker and these deltas consume it. If Phase 3 lands first, this is already present — verify, don't rebuild.

- **`user_referrals`** — table as defined in the Phase 3 plan (`referee_user_id` PK, `referrer_user_id`, `referrer_handle`, `source check ('share','invite','code')`, `created_at`, `check (referee <> referrer)`). **Addition:** allow `source = 'code'` for the personal-QR/handle path so the entry point is distinguishable in analytics.

- **`record_referral(p_referrer_handle text, p_source text default 'share') returns uuid`** — `SECURITY DEFINER`, `search_path = public`:
  - Validate `p_source in ('share','code')` (the `'invite'` source is written server-side in the invite-claim path, not via this RPC).
  - Resolve `p_referrer_handle` → `referrer_user_id` via `user_profiles` (case-insensitive on `handle`). If unknown handle → return null (no-op).
  - Guard: `referrer_user_id <> auth.uid()` (no self-referral).
  - `insert into user_referrals (referee_user_id, referrer_user_id, referrer_handle, source) values (auth.uid(), …, p_source) on conflict (referee_user_id) do nothing` (first-wins, idempotent).
  - `revoke all from public; grant execute to authenticated`.
  - This is the **only** sanctioned client referral write path. Forge-proof: a caller can only ever set their own `referee`. The personal-QR/onboarding path passes `p_source => 'code'`; the `?ref` link path passes `'share'`.

- **`?ref={handle}` parsing + `apps/mobile/src/lib/pendingReferral.ts`** — shared verbatim from Phase 3 Task 3 (stash a ref handle seen pre-auth; resolve on first signed-in session by calling `record_referral`).

- **"Who brought you? @___" onboarding step** — extend the `user_preferences.onboarding_step` CHECK constraint with a new `'referrer'` value (placed before `'complete'`). The step:
  - Prefills the handle from `pendingReferral` when the param survived the install.
  - Otherwise the new user types/confirms `@handle`.
  - On submit, calls `record_referral(handle)`. Skippable (no referrer is valid).
  - This is what makes the **in-person QR (cold App Store install)** attribute reliably, since the `?ref` param is usually dropped across an App Store install.

### 4.A Personal Insider QR / code

- **Mobile "My Insider Code" screen** — gated to `role = 'super_user'`. Shows:
  - `@handle` (the spoken/typed code),
  - the link `https://happitime.biz/r/{handle}`,
  - a **rendered QR** of that link,
  - a native share-sheet button,
  - a live "you've brought **N** people" count (read `count(user_referrals where referrer_user_id = me)`).
  - QR rendering is **client-side**. Preferred: reuse the extracted `@happitime/venue-qr` render module if it is client-safe; otherwise add a lightweight RN QR component. (Note: `scripts/generate-venue-qrs.mjs` is a Node/server generator — not directly reusable in RN. Resolve in the plan.)

- **Web landing `apps/directory/r/[handle]`** — mirrors the `/v/[slug]` and `/i/[token]` landings:
  - Validates the handle against a public `user_profiles` row; 404 on unknown/private.
  - Renders "Join HappiTime — invited by **@display_name**" with avatar + App Store / Play buttons.
  - If the app is installed, the Universal Link hands off to the app (deep link `happitime://referral/{handle}`), which stashes the ref via `pendingReferral`.
  - **AASA + intent filters:** add `/r/*` to `apps/directory/public/.well-known/apple-app-site-association` and an Android `pathPrefix: "/r"` in `apps/mobile/app.json` — the exact one-line pattern Phase 2 used for `/v/*`. (Native change → rides the next build; AASA change → Vercel deploy.)

### 4.C Itinerary-save attribution (share-level)

- **New table `super_user_credit_events`** (content-grain, append-only):
  ```sql
  create table public.super_user_credit_events (
    id             uuid primary key default gen_random_uuid(),
    super_user_id  uuid not null references auth.users(id) on delete cascade,  -- the sharer
    actor_user_id  uuid not null references auth.users(id) on delete cascade,  -- who saved
    kind           text not null check (kind in ('itinerary_save')),
    subject_id     uuid not null,                  -- source list id (the shared itinerary)
    created_at     timestamptz not null default now(),
    check (super_user_id <> actor_user_id),
    unique (actor_user_id, subject_id)             -- idempotent: one credit per saver per itinerary
  );
  create index super_user_credit_events_su_idx on public.super_user_credit_events (super_user_id, created_at desc);
  ```
  - RLS: the Super User reads their own rows (`super_user_id = auth.uid()`); admin reads all (`is_happitime_admin()`); **no** INSERT/UPDATE/DELETE policy (writes via `SECURITY DEFINER` function / service-role only).

- **Extend `copy_shared_itinerary(p_token)`** (already `SECURITY DEFINER`): after creating the copy, look up the **source list's owner** (`user_lists.user_id` of the row whose `share_token = p_token`). If that owner is a `super_user` (`user_profiles.role`) and `<> auth.uid()`, insert one `super_user_credit_events` row (`kind = 'itinerary_save'`, `subject_id = source list id`) `on conflict (actor_user_id, subject_id) do nothing`. No behavior change to the copy itself.

### 4.B Platform Super Admin attribution dashboard

- **`super_user_attribution_summary`** — view (or `SECURITY DEFINER` RPC for admin), one row per `super_user_id` (`user_profiles.role = 'super_user'`):
  - `referees` = `count(user_referrals where referrer_user_id = su)`
  - `first_checkins_driven` = distinct `(referee, venue)` first check-ins by the SU's referees (reuse Toastmaker first-visit logic, **without** the per-venue `group by` — platform-wide)
  - `redemptions_driven` = `count(round_redemptions)` by the SU's referees
  - `itinerary_saves` = `count(super_user_credit_events where kind='itinerary_save', super_user_id = su)`
  - `venues_touched` = distinct venues the SU's referees checked into
  - Check-in/redemption columns are null/zero until Phase 1 (`checkins`, `round_redemptions`) is deployed — see §6.

- **Surface** — extend `apps/web/src/app/admin/users`:
  - Add attribution columns to `SuperUsersTable` (referees, first check-ins driven, itinerary saves).
  - Per-SU breakdown on `admin/users/[userId]`: the numbers **+ which venues they sent traffic to** (the "effect on traffic" view), drilling into `venues_touched` with per-venue first-check-in counts.
  - Reads via the existing `createServiceClient` (admin pages already run service-role).

---

## 5. Data flow (in-person QR — the primary scenario)

1. Super User opens **My Insider Code**, shows the QR (`/r/{handle}`).
2. New user scans → web landing `apps/directory/r/{handle}` → App Store → installs.
3. First app open: onboarding reaches the **"Who brought you?"** step — prefilled from `pendingReferral` if the ref survived, else the user types `@handle`.
4. Submit → `record_referral(handle)` → one `user_referrals` row (`source='code'`, first-wins). → **metric #1**.
5. Later, the referee checks in at a venue → `verify-checkin` writes `checkins` + `venue_attribution_events`; the summary view joins it through `user_referrals` → **metrics #2/#5/venues_touched**. A Round redemption → **metric #3**.
6. Separately, anyone saving an itinerary the SU shared → `copy_shared_itinerary` writes a `super_user_credit_events` row → **metric #4**.
7. All of it aggregates in `super_user_attribution_summary` → rendered in the Super Admin console.

## 6. Sequencing & dependencies

1. **Foundation (§4.0)** → 2. **A (§4.A)** → 3. **C (§4.C)** → 4. **B (§4.B)**.

- Foundation, A, C, and the **referees + itinerary_saves** metrics need **no** Phase 1 deploy.
- B's **check-in / redemption** columns depend on Phase 1 (`checkins`, `round_redemptions`) being **deployed** (PR #77 — deploy verification currently deferred). B ships referees + saves first; check-in columns light up once Phase 1 is live.
- If Phase 3 Toastmaker lands first, §4.0 already exists — verify `record_referral` is forge-proof (RPC, not client insert) and `source` allows `'code'`; do not rebuild.

## 7. Testing

- **RLS persona tests** for `super_user_credit_events` (mirror `test/toastmaker-rls.test.mjs` / `test/pilot-checkin-rls.test.mjs`): SU reads own rows, stranger does not, admin reads all, no client write path.
- **`record_referral` forge test**: a caller can only set their own `referee`; unknown handle → no-op; self-referral rejected; second call is a no-op (first-wins).
- **`copy_shared_itinerary` credit test**: saving a super-user-shared itinerary writes exactly one credit event; saving your own → no credit; saving twice → still one (idempotent); non-super-user sharer → no credit.
- **`?ref` parser tests** — shared with Phase 3 (handle extraction from `/r/{handle}`, `/v/{slug}?ref=`, `/i/{token}?ref=`).
- **Admin route/page tests** for the summary view + per-SU breakdown (non-admin → no access; numbers match seeded data).
- **AASA test** — extend `test/aasa-venue-paths.test.mjs` (or a sibling) to assert `/r/*` is served.

## 8. Out of scope (pilot)

- GM/venue-console Insider analytics (the Toastmaker nominee card already covers the per-venue view).
- Vanity short codes / a code table (handle is the code).
- Paid deferred-deep-link provider (Branch/Adjust).
- Cross-network or monetary rewards for Insiders; leaderboards beyond the admin rollup.
- Person-level itinerary attribution (we chose share-level).

## 9. Open items for the plan

- QR client-render path: confirm `@happitime/venue-qr` is client-safe in RN, else pick a small QR component.
- Exact placement of the `'referrer'` onboarding step relative to the existing `'handle'`/`'profile'` steps.
- Whether `super_user_attribution_summary` is a plain view (simplest) or a `SECURITY DEFINER` RPC (if admin reads need to bypass RLS cleanly) — admin already uses service-role, so a plain view is likely sufficient.
