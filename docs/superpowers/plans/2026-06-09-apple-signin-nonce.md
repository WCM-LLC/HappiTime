# Apple Sign-In Nonce (iOS) — Implementation Plan

Design: `docs/superpowers/specs/2026-06-09-apple-signin-nonce-design.md`
**Deferred** — execute in a future session with a real iOS device available. This is the
auth-outage path; the device test is a hard gate, not optional.

## Preconditions
- A physical iPhone (or TestFlight) able to do a real Apple-ID login.
- Ability to cut + submit an EAS production build (native dependency ⇒ not OTA-able).

## Steps

1. **Add dependency**
   - `cd apps/mobile && npx expo install expo-crypto` (SDK-54-matching version, ~15.x).
   - Confirm it appears in `apps/mobile/package.json` and no config plugin is required.

2. **Write the failing test first (TDD)** — use `superpowers:test-driven-development`.
   - New `apps/mobile/.../appleNonce.test.ts` (or repo test dir): assert
     `hashed === SHA256(raw)` via Node `crypto`, `raw !== hashed`, two calls differ,
     `raw` matches `/^[0-9a-f]{64}$/`. Mock `expo-crypto` to delegate to Node `crypto`.
   - Rewrite `test/mobile-ios-swiftui.test.mjs` (~line 48) to assert the correct
     asymmetric wiring + the same-identifier-to-both regression guard. Remove the
     `doesNotMatch(/makeNonce/)` / `doesNotMatch(/signInAsync({ nonce,/)` guards.
   - Run; confirm red.

3. **Implement `src/lib/appleNonce.ts`** exactly as in the design (32-byte CSPRNG → hex;
   `digestStringAsync(SHA256, raw)`).

4. **Wire `AppleSignInButton.ios.tsx`**: call `makeAppleNonce()`, pass `hashed` to
   `signInAsync`, `raw` to `signInWithIdToken`; hard-fail + status message on crypto error;
   keep `ERR_REQUEST_CANCELED`. Run tests; confirm green.

5. **Verify (`superpowers:verification-before-completion`)**: `npx tsc --noEmit` clean;
   `node --test test/mobile-ios-swiftui.test.mjs` + the new unit test green.

6. **Build + device test (HARD GATE)**:
   - `eas build --profile production` from `master`.
   - On device/TestFlight: **Apple-ID login succeeds** AND **email login still works**.
   - Inspect the returned session; confirm no `Auth error`.
   - If either fails → do NOT submit; debug with `superpowers:systematic-debugging`.

7. **Ship**: `eas submit` → Apple review → phased release. Keep prior build for rollback.

8. **Record**: update `incident_ota_login_outage_2026-06-08` memory — nonce correctly
   re-added, device-tested, shipped via build N; close the "STILL OPEN" item.

## Rollback
The change is in a store build, not an OTA. Rollback = halt phased release / submit the
prior good build. There is no OTA hotfix for this native change.
