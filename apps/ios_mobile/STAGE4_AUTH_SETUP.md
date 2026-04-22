# Stage 4 — Auth & Session Setup Requirements

This document lists the external iOS/Xcode setup required for auth/session correctness and Supabase compatibility.

## Implemented in Code (Stage 4)

- Session bootstrap now restores and refreshes sessions where needed.
- Magic-link sign-in uses Supabase GoTrue `/auth/v1/otp`.
- OAuth (Google/Apple) builds Supabase authorize URL and opens external browser flow.
- Callback/deep-link handling parses `access_token` + `refresh_token` from fragment/query and establishes an authenticated session.
- Sign-out clears local session and attempts Supabase `/auth/v1/logout`.
- Auth session persistence now defaults to Keychain via `KeychainKeyValueStore`.

## Required Info.plist Keys

Add these keys to the iOS target Info.plist:

- `SUPABASE_URL` (String)
- `SUPABASE_ANON_KEY` (String)
- `AUTH_REDIRECT_SCHEME` (String, e.g. `happitime`)
- `GOOGLE_IOS_CLIENT_ID` (String, if Google sign-in is enabled)
- `NSLocationWhenInUseUsageDescription` (for upcoming location parity stages)

## URL Schemes

In Xcode target settings:

1. Add URL type for `AUTH_REDIRECT_SCHEME` (example: `happitime`).
2. If using Google Sign-In SDK later, also add reversed Google client ID URL scheme.

Expected callback format:

- `happitime://auth/callback#access_token=...&refresh_token=...`

## Supabase Dashboard Configuration

In Supabase Auth settings:

- Add redirect URL: `happitime://auth/callback`
- Enable providers used in mobile app parity:
  - Email (OTP / magic link)
  - Apple
  - Google

## Apple Sign-In Requirements

In Apple Developer + Xcode:

- Enable **Sign In with Apple** capability on the app identifier.
- Ensure the same bundle identifier is used by the iOS target and any auth settings.

## Google Sign-In Requirements

For parity with React Native OAuth behavior:

- Configure Google OAuth credentials for iOS app bundle.
- Provide `GOOGLE_IOS_CLIENT_ID` in Info.plist.
- Ensure Supabase Google provider uses matching client settings.

## Entitlements / Capabilities

Stage 4 specifically needs:

- Sign In with Apple capability.

Future stages will also need:

- Push Notifications
- Background Modes (if notification behavior matches RN app)

## Notes on Flow Parity

- React Native app uses magic-link and OAuth (Google/Apple), not email/password.
- This Stage 4 implementation intentionally mirrors those auth methods.
- Email/password is not added to avoid parity drift.

