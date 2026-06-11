# Behavior-First Onboarding — Design Spec

**Date:** 2026-06-11
**Status:** Approved (brainstorm) — ready for implementation plan
**Design source (pixel-perfect reference):** `docs/design/onboarding/` — `Onboarding Flow.html`, `ob-screens.jsx`, `ob-atoms.jsx`, `ob-feed.jsx`, `colors_and_type.css` (from a Claude Design handoff bundle). Recreate the visuals in React Native; match output, not prototype structure.

## 1. Goal

Replace the app's auth-first linear onboarding with a **behavior-first** flow: a guest browses real deals immediately (no account), and signup is **earned** the moment they save or check in. Notifications are primed **contextually** after the first save. Crucially, **referral/QR attribution is preserved even if the guest never signs up in that session** — it is credited to the originator whenever the account is eventually created.

## 2. Locked decisions (from brainstorm)

1. **Full behavior-first redesign** — guest browse before account; earned signup on gated actions; replaces the current linear onboarding.
2. **Minimal post-signup step** — after the first signup, a one-time step captures `@handle` + "Who brought you?" (referrer); profile/avatar/extra prefs are lazy/contextual.
3. **Providers v1:** the **three providers exactly as they work today** — Apple (`AppleSignInButton`), Google (the existing `supabase.auth.signInWithOAuth({ provider: "google" })` web flow), and email/magic-link (`signInWithOtp`). **No auth-mechanism changes.** Native one-tap Google is **deferred** (see §12) until the Android app is live for all users.
4. **LOGIN INVARIANT (hard requirement):** every existing user must be able to sign in exactly as before. The redesign only *adds* an entry point (the earned-signup sheet) that calls the **same existing handlers**; it must not change, gate, or remove any current login path. Any refactor that shares those handlers between `AuthScreen` and the sheet must be **behavior-preserving** and verified.
5. **Durable referral attribution (first-class):** a QR/referral `?ref` captured as a guest must survive app restarts and be auto-applied to the originator whenever the user signs up — independent of any manual step.

## 3. Existing assets (do not rebuild)

- **Guest mode** already exists — `App.tsx` has `guestChoice: "prompt" | "skip" | "signin"`; a guest path is used today for QR deep links (`enterGuestForVenueScan` / `useVenueLinkCapture`).
- **Apple Sign-In** — `AppleSignInButton.ios.tsx` + `appleNonce.ts`; **email/magic-link** — `AuthScreen` + `useMagicLinkListener`.
- **Referral capture** — `parseReferralLink`/`parseVenueLink`/`parseItineraryLink` extract `?ref`; `record_referral(p_referrer_handle, p_source)` RPC (forge-proof, first-wins); `useReferralCapture` applies a stashed handle on first session. **`pendingReferral` is currently in-memory — this spec makes it durable.**
- **Onboarding step machinery** — `apps/mobile/src/onboarding/state.ts` (`ONBOARDING_STEPS`), `OnboardingScreen.tsx`, `useOnboardingStatus`.

## 4. Architecture — the entry state machine

`App.tsx`'s gate is rewired:

```
not-onboarded guest:  Splash → Location-Prime → Vibe-Picker → enter app as GUEST (browse the deals feed)
guest taps Save/Check-in (a "gated action"):
    → EarnedSignupSheet (Apple / email)
    → on success → PostSignupCapture (one-time: @handle + "Who brought you?") → resume the action
after the first Save/Check-in: → NotifPrimeSheet (contextual notifications opt-in)
already-signed-in returning user: straight to the app
```

`onboarding_completed_at` is set when the guest finishes Vibe-Picker (they've "onboarded" into browsing), so the pre-feed screens never re-show. Signed-in state is separate from onboarded state.

## 5. Components (RN; theme from `apps/mobile/src/theme`)

Pixel-perfect from `docs/design/onboarding/ob-screens.jsx` + `ob-atoms.jsx`:

1. **`ObSplash`** — `ObLogo`, headline ("Kansas City's happy hours, live."), subtitle, primary "Find deals near me", caption "Browsing is free. No account needed."
2. **`ObLocationPrime`** — map visual (the SVG in `ObMapVisual` → RN `react-native-svg` or an equivalent static asset), headline "Deals within walking distance", primes the real OS foreground-location prompt on "Enable location"; on deny/manual shows the **neighborhood chip** fallback (`HOODS`) + "Show deals in {hood}".
3. **`ObVibePicker`** — skippable 2-col grid of `VIBES` (Dive bar, Cocktails, Patio, Sports bar, Late-night eats, Brewery, Margs & tacos, Wine), "Skip" + "Show tonight's deals".
4. **`EarnedSignupSheet`** — bottom sheet on a gated action; framing reflects the action ("Save your spots" / "Start earning rounds"); **reuses the existing `AuthScreen` handlers as-is** — Apple, the existing web-OAuth Google, and email/magic-link. Prefer calling the existing handlers (or extracting them into a shared module via a strictly behavior-preserving refactor — see the Login Invariant, §2.4); do NOT alter any login path. Dismiss returns to browsing.
5. **`PostSignupCapture`** — one-time after first signup: claim `@handle` (reuse the handle input + validation from today's onboarding) + "Who brought you?" **pre-filled from the durable referral stash**; calls `record_referral`. Skippable, but attribution still auto-applies (see §6).
6. **`NotifPrimeSheet`** — contextual notifications opt-in fired ~1.3 s after the first save/check-in (mirrors the prototype's `maybePrimeNotifications`).

## 6. Durable referral attribution (load-bearing)

- **`apps/mobile/src/lib/pendingReferral`** is upgraded from an in-memory variable to an **AsyncStorage-backed** durable stash (`setPendingReferral` writes storage; `peekPendingReferral`/`takePendingReferral` read/clear).
- **Capture:** the moment a guest arrives via `/v/{slug}?ref=`, `/r/{handle}`, or `/i/{token}?ref=`, the handle is written to the durable stash. **First-wins:** if a handle is already stashed, do not overwrite (honor the originator).
- **Apply:** on the **first signed-in session** (whenever it happens — same session or days later across restarts), `useReferralCapture` reads the durable stash → `record_referral(handle, 'code')` → clears the stash. This is automatic and does **not** depend on the PostSignupCapture step.
- **Backstop:** PostSignupCapture pre-fills "Who brought you?" from the stash so the user confirms the originator; it also lets a user whose `?ref` was lost to a cold App Store install type the handle manually.
- **Guarantee:** scan QR / tap referral link → browse as guest indefinitely (no account) → whenever the account is created, the originator is credited (first-wins `user_referrals`). `record_referral`'s forge-proofing + PK keep it safe.

## 7. Guest state & persistence

- **Guest selections** (location/hood + vibes) are held in a durable local stash while there's no account; **persisted to `user_preferences` on signup** (vibes → the existing preference fields — `interests`/`cuisines`; hood/location → `home_*`/`location_enabled`). For guests, they drive the local feed filter only.
- A returning guest resumes at the feed (onboarded flag set), not the splash.

## 8. Pilot reconciliation (must keep working)

- **Check-in** (2-factor, `verify-checkin`) needs auth → it becomes a **gated action**: a guest tapping Check-in gets the EarnedSignupSheet, then the check-in completes. The code+geofence anti-cheat is unchanged.
- **Insider/Toastmaker** depend on `@handle` (PostSignupCapture) + `user_referrals` (durable attribution §6) → both preserved.
- **Save/favorite** writes `user_followed_venues` (a gated action).

## 9. Build sequence (decomposed — each slice ships independently)

- **Phase 1 — Pre-feed screens + guest entry + durable attribution.** The 3 screens (Splash/Location/Vibes), rewired entry (not-onboarded → screens → guest feed), and the **durable referral stash** (§6) so attribution is protected from day one. *(This is the literal "Onboarding Flow.html" + the attribution guarantee you asked for.)*
- **Phase 2 — Earned signup + gated actions + post-signup capture.** Save/check-in route through `onGated`; EarnedSignupSheet; PostSignupCapture (handle + referrer auto-apply).
- **Phase 3 — Contextual notif prime + vibes/pref persistence + lazy profile.**

## 10. Edge cases

- Location denied → neighborhood fallback; vibes skipped → no filter.
- Guest dismisses EarnedSignupSheet → action cancels, keeps browsing; stash + state retained.
- Android (no Apple) → email/magic-link path in the sheet.
- Cold App Store install drops `?ref` → PostSignupCapture manual entry is the backstop.
- Same device, second different user → first-wins per referee + clear-on-apply prevent mis-attribution.
- Already-signed-in user → never sees the pre-feed screens.

## 11. Testing

- Pure state-machine transition tests (splash→location→vibes→feed; gated-action→signup→resume).
- **Durable attribution tests:** stash survives a simulated restart (persisted read), first-wins (no overwrite), auto-apply calls `record_referral` then clears; parser `?ref` extraction (shared with Phase 5).
- Vibes/location → preferences persistence on signup.
- Source-assertions for the gate rewire; `apps/mobile` tsc clean.
- **Login-invariant regression (§2.4):** assert `AuthScreen`'s existing Apple / web-OAuth Google / email handlers are unchanged (or shared via a verified pure refactor); device-verify all three existing login paths still work for a returning user.
- Device-verify the full flow incl. QR-scan-as-guest → later signup → attribution.

## 12. Deferred — native one-tap Google (NOT in this work)

Native one-tap Google (`@react-native-google-signin/google-signin` → `idToken` → `signInWithIdToken`) is **deferred until the Android app is live for all users**. It is NOT part of this redesign — Google continues to use the **existing** `signInWithOAuth` web flow, unchanged. When picked up later it needs: the native module (rides a build, not OTA), iOS + Android Google OAuth client IDs (same GCP project as the Supabase Google provider's web client), those client IDs added to Supabase → Authorized Client IDs, and the iOS reversed-client-id URL scheme in `app.json`. Captured here so it isn't lost; **do not implement it now.**

## 13. Out of scope (v1)

- The social/activity feed redesign (this is the deals/venue browse entry).
- Re-architecting the deals feed itself beyond wiring guest entry + vibe filter.
- Per-venue-timezone, background-location consent (separate specs).
