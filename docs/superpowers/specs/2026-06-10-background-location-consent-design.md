# Background-Location Consent — Design Spec

**Date:** 2026-06-10
**Status:** Approved (brainstorm) — ready for implementation plan
**Context:** Pilot Phase 4 (push/proximity). Resolves the spec's background-location privacy decision (`PILOT_BUILD_SPEC.md` §7) — **option (b): keep proximity/background location, gated by explicit opt-in consent.**

## 1. Problem

`apps/mobile/src/hooks/useVisitTracker.ts` runs **background ("Always") location** — 40 m auto check-in (→ `venue_visits`) + 2.5 mi happy-hour/event proximity pings. Today it is started from `App.tsx:117`, gated only on `preferences.location_enabled` — the **foreground** flag set by the onboarding "location" step (which calls `requestForegroundPermissionsAsync` for maps + check-in). So a user who enabled foreground location in onboarding gets the OS **"Always"** prompt with **no in-app explanation of why**. That conflates two distinct uses and conflicts with the pitch's "location only at check-in, never background."

**The two location uses must be separated:**
- **Foreground** — at check-in (the code + GPS **geofence** = the 2-factor anti-cheat that feeds the Toastmaker leaderboard via `checkins`) and maps. Already onboarded via `location_enabled`. **Unchanged by this work.**
- **Background "Always"** — proximity reminders + auto check-in. Needs its **own** explicit, in-context opt-in. **This spec adds that.**

> Note: leaderboard integrity depends on the **foreground** code+geofence check-in, not background location. Background is justified by proximity-reminder value, not anti-cheat.

## 2. Locked decisions (from brainstorm)

1. **Placement:** in-context prompt + Settings toggle (NOT a forced onboarding step). Matches Apple's "request Always in context" guidance.
2. **Storage:** a **new** `user_preferences.background_location_consent boolean default false` — distinct from `location_enabled`.
3. **In-context trigger:** show the consent modal **once**, the first time the user favorites a venue.
4. **2-factor check-in is fully independent** and unaffected.

## 3. Components

### 3.1 Storage (migration)
- Add `background_location_consent boolean not null default false` to `public.user_preferences`.
- Add `background_location_prompt_seen boolean not null default false` (so the one-time in-context prompt never nags). Fresh migration timestamp (after all merged migrations).
- The mobile `useUserPreferences` hook + its type gain both fields (read/write).

### 3.2 `BackgroundLocationConsentModal` (RN component)
- Reusable modal that **primes the permission** before any OS prompt:
  - Copy: "Get a heads-up when a happy hour or event is starting at a venue you follow — and check in automatically when you arrive. This uses your location in the background. You can turn it off anytime in Settings."
  - **Enable** → `Location.requestBackgroundPermissionsAsync()`; on `granted` set `background_location_consent = true`; on denial leave it `false` and show a one-line "You can enable it later in iOS Settings." Always set `background_location_prompt_seen = true` on either choice.
  - **Not now** → dismiss; `prompt_seen = true`, consent stays `false`.
- Requires foreground permission first (it's a prerequisite for background); if foreground isn't granted, request it before the background request (reuse the existing `Location.requestForegroundPermissionsAsync` pattern).

### 3.3 Settings toggle — "Nearby reminders"
- On the profile/settings screen (the same screen that hosts the Insider entry point added in Phase 5). A switch bound to `background_location_consent`:
  - **ON** → run the consent flow (request background permission; set flag on grant).
  - **OFF** → set flag `false` + call `stopTracking()`.
  - **Reconcile on mount:** if `background_location_consent` is true but the OS permission is no longer "granted" (user revoked "Always" in iOS Settings), show the toggle **off** and clear the flag. The durable control of record is the OS permission ∧ the flag.

### 3.4 In-context trigger (first favorite)
- In the favorite/follow-venue action, when a user favorites a venue AND `background_location_prompt_seen === false` AND `background_location_consent === false`, present `BackgroundLocationConsentModal`. Fire once (guarded by `prompt_seen`).

### 3.5 Gating change (the load-bearing fix)
- `startTracking()` IS the background proximity engine (foreground/maps and check-in location are captured elsewhere, not here). So `App.tsx:117`'s effect **switches its gate from `preferences.location_enabled` to `preferences.background_location_consent`** — start `startTracking()` only when consent is `true`; otherwise `stopTracking()`. `location_enabled` no longer triggers background tracking.
- `useVisitTracker.startTracking()`: must not call `requestBackgroundPermissionsAsync` / `startLocationUpdatesAsync` unless consent is true. Cleanest: App.tsx only calls `startTracking()` when consent is true, so the OS "Always" prompt can never fire without the in-app modal having run first. (Foreground capture used elsewhere for check-in stays separate and unchanged.)

### 3.6 Privacy strings / pitch
- Verify `apps/mobile/app.json` `NSLocationAlwaysAndWhenInUseUsageDescription` (and `NSLocationWhenInUseUsageDescription`) clearly state: proximity reminders for followed venues + automatic check-in. Update if vague. (Native string → rides the next build.)
- Update `PILOT_BUILD_SPEC.md` §7 / any pitch language: "location only at check-in, never background" → "background location is **opt-in**, used for proximity reminders + auto check-in."

## 4. Data flow

Favorite a venue (first time) → modal → **Enable** → (foreground if needed →) OS "Always" prompt → granted → `background_location_consent = true` → `App.tsx` effect → `startTracking()` → background proximity engine runs. **Decline anywhere** → no background tracking; foreground check-in, maps, and the saved-venue cron pushes all still work. Settings toggle can flip it on/off later.

## 5. Edge cases
- **Enable but OS-denied:** flag stays `false`; gentle "enable in iOS Settings" note; `prompt_seen` still set so we don't re-nag.
- **OS permission revoked later:** next reconcile (Settings mount / app foreground) clears the flag and `stopTracking()`.
- **Foreground denied:** background is impossible; surface that and don't set consent.
- **Android:** `requestBackgroundPermissionsAsync` maps to `ACCESS_BACKGROUND_LOCATION`; same flag/flow applies.
- **2-factor check-in:** independent — `verify-checkin`'s geofence uses location captured at check-in time (foreground), never this consent.

## 6. Testing
- **Migration test** — asserts the two new columns + defaults (source-assertion, mirror existing migration tests).
- **Source-assertion / unit** — `startTracking` (or the App.tsx gate) is gated on `background_location_consent`, not `location_enabled`; the modal calls `requestBackgroundPermissionsAsync` only inside the Enable handler.
- **`tsc`** clean on `apps/mobile`.
- **Device verification** — first-favorite prompt → Enable → "Always" prompt → tracking starts; Settings toggle off → tracking stops; revoke in iOS Settings → toggle reconciles off. (Native — rides the next build.)

## 7. Out of scope
- Per-venue-timezone correctness of the proximity pings (separate concern).
- Changing the foreground check-in / maps consent (`location_enabled`) — untouched.
- Re-architecting `useVisitTracker`'s proximity math.

## 8. Open items for the plan
- Exact profile/settings screen + favorite-action file paths (discover during planning; the favorite action writes to `user_followed_venues`, the settings entry point is the Profile screen that hosts the Insider row).
- Whether to also expose the toggle's "denied" state with a deep link to iOS Settings (`Linking.openSettings()`) — nice-to-have.
