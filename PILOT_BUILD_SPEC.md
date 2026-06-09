# Pilot Build Spec — Check-In Codes, Rounds, Toastmaker

**Status:** Draft for review · June 6, 2026
**Goal:** Everything required to run a real 30-day venue pilot ("free 30 days, $99/mo after") with verifiable check-ins, the Rounds buyback, and the daily venue digest — sequenced so the pilot spine ships first.
**Companion docs:** `SUPER_USER_FEATURE_PROMPT.md` (May 18 — superseded in part by this spec), `DB_SCHEMA.md`, `BACKLOG.md`.

---

## 1. What this enables (the pitch, verbatim)

- Venue gets a **daily 4-char code**; users check in with **code + GPS** (two-factor presence proof).
- Check-in = **stamp, not discount**. 5 verified visits at a venue → **house buys your round** (the digital buyback).
- Venue gets a **6am daily email** — code in the subject line, yesterday's stats in the body.
- **First scan/check-in = "birth certificate"** — new-vs-returning is provable per venue.
- **Toastmaker**: each venue's top traffic-bringer, computed by the system, **ratified by the GM** ("my board, my blessing").

## 2. Existing assets to build on (do not duplicate)

| Asset | Location | Use |
|---|---|---|
| `venue_attribution_events` (source: `qr\|app_checkin\|push_click\|organic`, lat/lng, session_id, rate-limited via `track-visit`) | `supabase/migrations/20260530221747` | New-vs-returning derivation; `app_checkin` source already valid |
| `track-visit` edge function | `supabase/functions/track-visit` | Pattern for the new `verify-checkin` function |
| Geofence/proximity client logic (40m auto check-in, dwell timer, 2.5mi HH ping, cooldowns) | `apps/mobile/src/hooks/useVisitTracker.ts` | Reuse distance + permission plumbing for code check-in screen |
| `notify-upcoming-happy-hours` (Expo push to users who saved venues, tier-gated) | `supabase/functions/` | Already covers much of the "radius" promise — see §9 |
| pg_cron live in prod (`cron.schedule` pattern) | `migrations/20260601210000` | Schedule the 6am digest |
| Resend transactional email | `apps/web/src/utils/email.ts` | Digest sender (edge function calls Resend API directly) |
| Org/venue portal + Stripe (incl. `founding_pilot` plan) | `apps/web/src/app/orgs/[orgId]/...` | Console pages; pilot billing already modeled |
| `super_user` role + `SuperUserBadge` | `apps/mobile/src/components/SuperUserBadge.tsx` | Evolve into Toastmaker badge |
| `org_notification_prefs`, `venue_scan_notification_pref` | migrations 20260531/20260604 | Digest opt-out honors these |

## 3. Locked product decisions (do not relitigate)

1. Code rotates **daily at 6:00 AM America/Chicago** — never midnight (mid-shift flip).
2. Charset: 31 chars `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I/L) + profanity denylist.
3. Check-in = stamp. No discount gating. Optional venue exclusives use time/scope, not price.
4. Rounds: **5 verified visits at a venue → 1 buyback** (per-venue, not network-wide, for pilot). Earn max 1/venue/day, 3/day network. Expire 6 months.
5. Anti-abuse: employees excluded at own venue; new-to-venue or 90-day-lapsed guests are what count for Toastmaker attribution; 5 code attempts → 15-min lockout.
6. GPS fallback ("server doesn't know the code"): max **2 lifetime per venue per user**, flags venue for follow-up.
7. Toastmaker: score = attributed redemptions ×3 + own check-ins ×1, rolling 90 days; floor = 6 check-ins + 3 attributed; **GM one-tap ratify/veto, quarterly**; title holds the quarter.
8. Data clause: venue list exportable on demand, never sold, no transfer on sale/shutdown without venue signature (goes in standard agreement — legal doc, not code, but console needs a working **export** button to make it true).

## 4. Phase 1 — Pilot spine (blocks the first real pilot)

### 4.1 Schema (one migration)

```sql
-- Per-venue secret + staff view token + geofence tuning
alter table venues
  add column checkin_secret uuid not null default gen_random_uuid(),
  add column staff_token uuid not null default gen_random_uuid(),
  add column geofence_radius_m integer not null default 100;

-- One row per verified presence. Rounds are DERIVED (count since last redemption).
create table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  method text not null check (method in ('code','gps_fallback')),
  service_date date not null,            -- 6am-CT-shifted date
  lat double precision, lng double precision,
  created_at timestamptz not null default now(),
  unique (user_id, venue_id, service_date)  -- 1/venue/day enforced here
);

create table round_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  venue_id uuid not null references venues(id),
  checkins_consumed int not null default 5,
  confirmed_with_code boolean not null default true,
  created_at timestamptz not null default now()
);

-- Venue flags (GPS-fallback overuse, staff-training needed)
create table venue_flags (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id),
  flag_type text not null check (flag_type in ('staff_code_unknown','abuse_suspected')),
  meta jsonb default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
```

RLS: `checkins`/`round_redemptions` — user reads own rows; org members read rows for their venues (mirror `venue_attribution_events` policy); **writes only via service-role edge function**. `venue_flags` — org members + admin read; service-role write.

### 4.2 Code generation (TOTP-style, no code table)

```
service_date = date(now() at time zone 'America/Chicago' - interval '6 hours')
code = encode_base31(HMAC_SHA256(venue.checkin_secret, service_date))[0:4]
if code in PROFANITY_DENYLIST: append counter byte and re-hash
```

- Deterministic: console, digest email, and `verify-checkin` all compute it independently — works offline, nothing to sync, nothing stored.
- Shared implementation in `packages/` (TS) + mirrored in the Deno edge function. **One test vector file both import** so they can never drift.
- Accept the previous service-date's code for a 10-minute grace window at rotation.

### 4.3 `verify-checkin` edge function

POST (authed) `{ venue_id, code, lat, lng }` →
1. Rate limit: 5 attempts / 15 min / user / venue (reuse `track-visit` limiter pattern).
2. Employee check: reject if user ∈ `org_members`/`venue_members` for this venue.
3. Code match (today or grace window). On failure return attempts remaining.
4. Geofence: haversine(lat/lng, venue.lat/lng) ≤ `geofence_radius_m`.
5. Network cap: ≤3 check-ins today across venues; impossible-geography velocity flag → `venue_flags(abuse_suspected)`.
6. Insert `checkins` row (unique constraint handles dupes) + `venue_attribution_events` row (source `app_checkin`, with user_id).
7. Return `{ stamps, stamps_to_next_round, is_first_visit }` — `is_first_visit` = no prior attribution event or checkin for (user, venue). **This is the birth certificate.**

GPS-fallback variant: same endpoint, `{ fallback: true }`, skips code check, enforces 2-lifetime cap, writes `method='gps_fallback'` + `venue_flags(staff_code_unknown)`.

### 4.4 Mobile UI (apps/mobile)

- Venue screen: **Check In** button, enabled inside geofence (reuse `useVisitTracker` distance utils; foreground location only on this screen).
- Code entry: 4-char keypad, "Ask your server for today's HappiTime code." Failure states per §4.3. Fallback link after 2 failed attempts.
- Success: stamp animation, progress ("3 of 5 — the house buys your next round"), **live clock on screen** (anti-screenshot), today's published offers below.
- Redemption at 5 stamps: "Round on the house" screen → server confirms by the user re-entering **today's code** (same primitive, zero new venue training) → insert `round_redemptions`, reset derived count.

### 4.5 Console (apps/web)

- Org-authed: today's code rendered **in the header of every org/venue page** (computed client-side from secret via API; never cached past 6am).
- **Zero-login staff view**: `apps/directory` route `/staff/[staff_token]` → today's code, huge, auto-refresh at rotation. Bookmarkable on a bar tablet. Token rotatable from console.
- Venue stats page: yesterday/7-day/30-day check-ins, first-timers vs returning, rounds redeemed, GPS-fallback flags. Reads `checkins` + `venue_attribution_events`.
- **Export my data** button (CSV of the venue's attribution/checkin rows) — makes the data clause true.

### 4.6 Daily digest email

- New edge function `send-venue-digest`; `cron.schedule('venue-digest', '0 11 * * *', ...)` (11:00 UTC = 6:00 CT; adjust for DST or compute in-function and schedule hourly with a guard).
- Subject: `Today's HappiTime code: {CODE} · {N} check-ins yesterday`.
- Body: yesterday's check-ins, first-timers, rounds redeemed, current Toastmaker standing (Phase 3+), link to console. Respect `org_notification_prefs`.
- From `HappiTime <noreply@happitime.biz>` via Resend (already configured). Identical subject format daily — scannable from a lock screen. **Reliability is contractual**: a venue that doesn't get the 6am email assumes the product is dead. Add a self-check: if the cron run sends 0 emails when ≥1 venue is active, alert admin.

**Phase 1 acceptance:** a venue with zero hardware can: see today's code in console + staff URL + email subject; a user inside the geofence checks in with the verbal code in <10 seconds; 5th check-in triggers a redeemable, code-confirmed buyback; the GM can answer "how many new faces did HappiTime bring Mon–Wed?" from the stats page; data export works.

## 5. Phase 2 — Deep-link routing (small, unblocks attribution)

- Add `linking` config to mobile `NavigationContainer`: `happitime://venue/{slug}` → VenuePreviewScreen (BACKLOG "Phase 2 leftover").
- QR landing (`apps/directory/v/[slug]`) keeps firing `track-visit`; once the app opens via deep link, the first authed attribution event closes the loop scan → install → first check-in.

## 6. Phase 3 — Toastmaker

- `toastmaker_scores` view: per (venue, user), rolling 90d: `attributed_redemptions*3 + checkins*1`, eligibility floor (≥6 check-ins AND ≥3 attributed). Attribution = invitees' first check-ins (extend `pending_friend_invites` / share links with `?ref={handle}`; referred user's first check-in at a venue credits the referrer for 90 days).
- Console: "Toastmaker nominee" card on venue page — name, handle, numbers → **Approve / Pass** (one tap). Approval writes `venue_toastmakers (venue_id, user_id, quarter, ratified_by)`.
- Display: venue page in app + directory ("Toastmaker: @handle"), profile badge (evolve `SuperUserBadge` — wine circle → raised-glass glyph), digest email line.
- Pilot shortcut: hand-pick the first Toastmaker per pilot venue with GM blessing; scoring accrues underneath and takes over at the first quarterly review.

## 7. Phase 4 — Push triggers (post-pilot, owner-tier promise)

- `notify-upcoming-happy-hours` already pushes saved-venue users on HH start (tier-gated, cron-ready) — **schedule it** and it covers most of the "sandwich board" pitch.
- ⚠️ **Privacy decision required before extending:** `useVisitTracker.ts` already implements background location (40m auto check-in, 2.5mi proximity pings). The venue pitch promised "location read only at check-in, never background." These conflict. Either (a) strip background tracking and make check-in fully manual + foreground (matches pitch; simpler App Store privacy story), or (b) keep proximity pings opt-in with explicit consent screen and update the pitch language. Decide before any owner meeting where this gets quoted. Recommendation: (a) for pilot; revisit (b) with real consent UX later.

## 8. Explicitly out of scope (pilot)

Network-wide Rounds redemption · Round Table / Top Shelf / Happy Few tiers (unlock by density, not code) · venue-side Toastmaker analytics beyond the nominee card · web push (`apps/web/src/services/notifications.ts` stubs stay stubs) · POS integration of any kind · in-app payments for deals.

## 9. Open questions for J

1. Buyback cadence: 5 visits is the working number — pressure-test with first pilot GM (6–7 if they flinch).
2. Where does the redemption cost land contractually — venue eats pour cost as CAC (current assumption); needs a sentence in the pilot agreement.
3. `nodemailer` root dependency is unused (Resend won) — remove during this work.
4. Migration-history drift (`TODO.md`) should be repaired **before** these migrations ship — `db push` is load-bearing here.

## 10. Suggested build order

1. §4.1 migration + §4.2 shared code lib (with test vectors)
2. §4.3 `verify-checkin` (unit-test rate limit, geofence, dedupe, first-visit)
3. §4.5 console header + staff URL (lets you demo to a venue before mobile ships)
4. §4.4 mobile check-in + redemption screens
5. §4.6 digest cron + self-check
6. §5 deep linking → §6 Toastmaker → §7 push decision
