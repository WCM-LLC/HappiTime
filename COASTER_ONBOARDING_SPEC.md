# Coaster Onboarding Spec — "Check in now," gated to in-venue first-runs

**Status:** Draft for review · June 26, 2026
**Goal:** After a brand-new user signs up, drop them straight into the check-in flow for the venue they're physically in — and **only** for users who are at a venue at first run (i.e. coaster-in-a-bar scanners), never organic/couch downloads.
**Companion docs:** `OPTION_B_ATTRIBUTION_SPEC.md`, `PILOT_BUILD_SPEC.md`.
**Universal coaster link:** `https://happitime.biz/app?utm_source=coaster&utm_medium=qr`

---

## 1. Why the gate is "at a venue," not "came from a coaster"

The universal coaster carries no venue, and **iOS gives a freshly-installed app no install referrer** — so "this install came from a coaster" is **not knowable on iOS** without an MMP (Branch/AppsFlyer), which Option B deliberately excludes.

That limitation is moot, because link-origin isn't the real condition:

- Check-in **requires physical presence** (daily code + GPS). A coaster scanner is in the bar; an organic downloader on their couch is not — and couldn't check in regardless.
- So gating on **first-run geofence match** (is the new user within a published venue's radius at signup?) is deterministic, free, cross-platform, and excludes organic installs precisely. A coaster-in-a-bar user passes; everyone else is silently skipped.

**Net:** presence is a stricter, more honest gate than link-origin — and it needs no MMP.

> If literal origin-gating is ever required, the only path is an MMP (Branch deferred deep link) — that reopens "Option A" and is out of scope here.

---

## 2. The flow

1. **Trigger:** user completes signup AND is a first-run user (no prior check-ins / `is_new_user`). One-time only.
2. **Locate (foreground, once):** request foreground location with a value-framed prompt — *"Find the spot you're in so you can check in."* Foreground-only, requested at this moment, matching the privacy stance in `PILOT_BUILD_SPEC.md` §7 (no background tracking for the pilot).
3. **Match:** find the nearest **published** venue within its `geofence_radius_m`.
4. **Branch:**
   - **Venue matched →** route to `CheckInScreen` for that venue, pre-selected, headline *"You're at {Venue}. Ask your server for today's HappiTime code."* → existing `verify-checkin` does the rest (code + GPS + stamp + `is_first_visit`).
   - **No match (organic / not at a venue) →** skip entirely, land on the normal home screen. **This is the "only coaster" guarantee in practice.**
5. **Fire once:** set a local `onboarding_checkin_shown` flag so it never repeats.

---

## 3. Edge cases / hardening

- **Location denied →** don't dead-end. Show a manual "I'm at a venue" search fallback, or just proceed to home. Never force location.
- **Two+ venues within radius (dense block) →** show a 2–3 item picker, nearest first.
- **Spoofing / fake presence →** not a concern for *routing*; the actual check-in is still guarded by the daily code + `verify-checkin` geofence. Onboarding only decides which screen to show.
- **Shared/forwarded link →** harmless. The link can't trigger the flow on its own; only being at a venue can.
- **Returning user reinstalls →** has prior check-ins, so not first-run; flow doesn't fire.

---

## 4. Build deltas

| # | Delta | Where | Size |
|---|---|---|---|
| ON1 | Post-signup hook: `is_new_user && first_run` → launch geofence onboarding | `apps/mobile` onboarding / nav root | S |
| ON2 | `nearest_published_venue(lat, lng, max_m)` — closest published venue within radius (PostGIS; venues already geocoded by `geocode-venues`). Or reuse `useVisitTracker` client distance utils. | Supabase RPC or client | S–M |
| ON3 | `CheckInScreen` onboarding entry variant: pre-selected venue, "ask your server for today's code" copy, **Skip**, manual-search fallback | `apps/mobile/src/screens/CheckInScreen.tsx` | S |
| ON4 | One-time local flag `onboarding_checkin_shown` (never repeat) | `apps/mobile` | XS |
| ON5 | *(Optional, Android only)* Play Install Referrer capture → stamp `coaster` origin on first check-in for deterministic Android-side origin labeling. iOS stays aggregate (GA) only. | `apps/mobile` Android | M |

ON1–ON4 deliver the whole behavior with no MMP. ON5 is a data-quality nicety, not required for the gate.

---

## 5. Attribution recap (how you still count coasters)

- **Aggregate scans:** `https://happitime.biz/app?utm_source=coaster&utm_medium=qr` → GA/GTM (already on the page). One number, venue-agnostic — the cost of a universal coaster.
- **Android per-install origin:** Play referrer (ON5) → deterministic "coaster" label.
- **The real proof (per venue, exact):** the first check-in writes `venue_attribution_events(source='app_checkin')` with `is_first_visit` = your **new-face** count. This is what you sell venues, and it's unaffected by the universal-vs-per-venue link choice because GPS resolves the venue at check-in.

---

## 6. Acceptance criteria

1. A new user who signs up **while inside a published venue's geofence** is dropped into that venue's check-in with "ask your server for today's code."
2. A new user who signs up **anywhere else** sees the normal home screen and is **never** prompted to check in.
3. The flow fires **at most once** per install.
4. No code path references an MMP / deferred-deep-link provider.
5. Location is foreground-only, requested at the check-in moment, with a working skip.
