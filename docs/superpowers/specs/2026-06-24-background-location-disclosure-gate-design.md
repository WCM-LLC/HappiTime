# Background-Location Disclosure Gate — Design

**Date:** 2026-06-24
**App:** `apps/mobile` (React Native / Expo; production Android ships from this workspace)
**Status:** Approved design, pre-implementation

## Problem

HappiTime 1.0.5 enables Android background location (`isAndroidBackgroundLocationEnabled`) so
`useVisitTracker` can deliver proximity-based "visit reminders." But there is **no prominent
in-app disclosure** before `requestBackgroundPermissionsAsync()` is called. Today:

- `App.tsx` starts tracking whenever `preferences.location_enabled && venues.length > 0`.
- `location_enabled` is set by a switch labeled **"Use current location"** in `ProfileScreen`
  (and the onboarding location step), both framed as *foreground* features.
- Flipping that foreground-framed toggle silently triggers the **background** permission
  request and a persistent "Tracking visits nearby" foreground service.

Google Play requires an affirmative in-app disclosure that explicitly states location is
collected **in the background / when the app is closed**, shown **before** the background
permission request. Without it, the 1.0.5 background-location declaration will be rejected,
and the required demo video has no disclosure screen to show.

## Goals

- No `requestBackgroundPermissionsAsync()` or background tracking until the user has seen a
  prominent disclosure and explicitly opted into "Visit reminders."
- Cleanly separate **foreground** consent ("Use current location": nearby/search/map) from
  **background** consent ("Visit reminders").
- Keep the app-level flag consistent with the OS-level permission grant.

## Non-Goals (YAGNI)

- No onboarding background opt-in step (Settings-only for now; onboarding stays foreground-only).
- No DB migration / cross-device sync of the consent flag (device-local).
- No change to the existing foreground "Use current location" behavior.

## Design

### New units

1. **`src/components/BackgroundLocationDisclosure.tsx`** — presentational `Modal`.
   - Props: `visible: boolean`, `onAccept: () => void`, `onDecline: () => void`.
   - Renders the prominent-disclosure copy (background / app-closed / purpose / optional) and
     two actions: `Not now` (decline) and `Turn on reminders` (accept).
   - Reuses the existing modal style pattern (as used by the delete-account and city-picker
     modals): backdrop + card + title + body + action row.

2. **`src/hooks/useVisitReminderConsent.ts`** — device-local consent store.
   - AsyncStorage key: `happitime:visit_reminders_enabled` (value `"true"`/absent).
   - Returns `{ enabled: boolean, loading: boolean, setEnabled: (v: boolean) => Promise<void> }`.
   - Default `false`. Mirrors the AsyncStorage pattern in `useOnboardingStatus` / `lib/pendingReferral`.

3. **`src/lib/visitTrackingGate.ts`** — pure helper.
   - `shouldTrack({ consent, consentLoading, venueCount }: { consent: boolean; consentLoading: boolean; venueCount: number }): boolean`
   - Returns `false` while `consentLoading`, otherwise `consent && venueCount > 0`.
   - Pure → unit-testable under the repo's `node:test` `.test.mjs` convention.

### Modified units

4. **`src/screens/ProfileScreen.tsx`**
   - Add a **"Visit reminders"** switch row directly under "Use current location".
   - Switch value = consent `enabled`.
   - Turning **on** (when currently off): do **not** set the flag yet — open the disclosure
     modal. On accept → `setEnabled(true)`. On decline → leave off.
   - Turning **off**: `setEnabled(false)` immediately.
   - Render `<BackgroundLocationDisclosure>` in this screen.

5. **`App.tsx`**
   - Consume `useVisitReminderConsent()`.
   - Replace the tracking effect's gate:
     `if (shouldTrack({ consent, consentLoading, venueCount: venues.length })) startTracking(); else stopTracking();`
   - This **decouples** background tracking from `preferences.location_enabled`.
   - On `startTracking()` returning `"denied"`: call consent `setEnabled(false)` and show a
     one-line alert directing the user to enable "Allow all the time" in system Settings.

6. **`src/hooks/useVisitTracker.ts`**
   - `startTracking` returns `"granted" | "denied"` instead of `void`
     (`"denied"` when either foreground or background permission is not granted; `"granted"`
     once `startLocationUpdatesAsync` is active). No other behavior change.

### Data flow

```
Profile "Visit reminders" ON
  → BackgroundLocationDisclosure (visible)
      → Accept → useVisitReminderConsent.setEnabled(true)  [AsyncStorage write]
          → App.tsx effect: shouldTrack(...) === true → startTracking()
              → requestForegroundPermissionsAsync → requestBackgroundPermissionsAsync
                  → granted: startLocationUpdatesAsync (foreground service runs)  ["granted"]
                  → denied:  App.tsx setEnabled(false) + alert → Settings           ["denied"]
      → Decline → flag stays false → no OS prompt
Profile "Visit reminders" OFF
  → setEnabled(false) → App.tsx stopTracking()
```

### Behavioral implication (intended, compliant)

Tracking is currently gated on `location_enabled`. After this change it is gated on the new
consent, which defaults **false**. Existing users who were being background-tracked via the
foreground toggle will **stop being tracked until they opt into "Visit reminders."** This is
the correct, compliant outcome — they never gave background-specific consent. Call this out
in release notes.

## Error handling

- **Background permission denied after consent:** `startTracking` returns `"denied"`; `App.tsx`
  resets the consent flag to `false` and alerts the user to grant "Allow all the time" in
  Settings. Keeps app flag ≈ OS reality.
- **AsyncStorage read in flight:** `shouldTrack` returns `false` while `consentLoading`, so
  tracking never starts before consent is known.
- **Foreground denied:** existing behavior (warn + early return), now surfaced as `"denied"`.

## Testing

- **`src/lib/visitTrackingGate.test.mjs`** (`node:test`):
  - consent `false` → `false`
  - `consentLoading true` (even with consent true, venues > 0) → `false`
  - consent `true`, `venueCount 0` → `false`
  - consent `true`, `venueCount > 0`, not loading → `true`
- **Manual / device verification** (the part the Play demo video records): toggle on →
  disclosure modal appears **before** the OS "Allow all the time" prompt → service starts;
  toggle off → tracking stops.

## Disclosure copy (initial)

Title: **Turn on visit reminders?**

Body: *HappiTime uses your location — including in the background, when the app is closed or
not in use — to detect when you're near a participating venue and send optional happy-hour and
visit reminders. This is optional; discovering, searching, and saving venues all work without
it. You can turn it off any time in Settings.*

Actions: **Not now** · **Turn on reminders**
