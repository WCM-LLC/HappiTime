# Apple Sign-In Nonce (iOS) — Design

**Status:** Approved design; implementation deferred (no code/build this session).
**Date:** 2026-06-09
**Context:** Re-adds OIDC replay protection to the iOS Apple Sign-In flow, correctly this
time. A previous attempt took down production Apple login twice (see
`incident_ota_login_outage_2026-06-08` memory). This design ships via a **new EAS build**,
device-tested before release — never via a hot OTA.

## Problem

`apps/mobile/src/components/AppleSignInButton.ios.tsx` currently exchanges the Apple
identity token with Supabase with **no nonce**. That works but leaves the flow open to
OIDC replay: a captured Apple `identityToken` could be replayed. A nonce binds the token
to one specific sign-in attempt.

The prior outage passed the **same raw nonce to both** Apple and Supabase. Apple embeds
the value it's given as the token's `nonce` claim; Supabase (GoTrue) hashes *its* copy
with SHA-256 and compares to the claim. Same-raw-to-both ⇒ claim `raw` ≠ `SHA256(raw)` ⇒
every login rejected.

## Correct protocol (asymmetric: hashed→Apple, raw→Supabase)

1. Generate a random **raw** nonce on device (CSPRNG).
2. Compute `hashed = SHA256(raw)`.
3. `AppleAuthentication.signInAsync({ ..., nonce: hashed })` → Apple stamps `hashed` into
   the token's `nonce` claim.
4. `supabase.auth.signInWithIdToken({ provider:'apple', token, nonce: raw })` → GoTrue
   computes `SHA256(raw)` and compares to the claim → **match**.

## Components

### `src/lib/appleNonce.ts` (new)
A single isolated function so the button stays thin and the crypto is unit-testable.

```ts
import * as Crypto from "expo-crypto";

/** Returns a fresh Apple Sign-In nonce pair: raw (for Supabase) + SHA-256 hash (for Apple). */
export async function makeAppleNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);           // 256-bit CSPRNG
  const raw = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); // 64-hex
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
  );                                                            // hex by default
  return { raw, hashed };
}
```

**Decision (approved):** 32-byte `getRandomBytesAsync` → hex for the raw nonce (256-bit
entropy), not `Crypto.randomUUID()`.

### `AppleSignInButton.ios.tsx` (modify)
- `const { raw, hashed } = await makeAppleNonce();` at the top of the handler.
- `signInAsync({ requestedScopes, nonce: hashed })`.
- `signInWithIdToken({ provider:"apple", token: credential.identityToken, nonce: raw })`.
- Keep existing `ERR_REQUEST_CANCELED` handling.
- **Decision (approved):** if nonce generation throws, surface an error and **abort**
  sign-in — no silent fallback to the no-nonce path (a fallback would mask the failure and
  defeat replay protection inconsistently).

### `expo-crypto` (new dependency)
Add via `npx expo install expo-crypto` (resolves the Expo-SDK-54-matching version, ~15.x).
It is a **native, autolinked** module ⇒ it cannot be delivered by OTA ⇒ **a new build is
mandatory**. No config plugin needed.

### `AppleSignInButton.tsx` (non-iOS fallback) — no change
Apple Sign-In is iOS-only here. Listed as a conscious non-change.

## Testing

The previous incident had a test that stayed green while prod was down (it asserted the
buggy pattern), so testing is explicit here:

1. **Rewrite `test/mobile-ios-swiftui.test.mjs`** (the assertion at ~line 48 currently
   asserts the *no-nonce* flow and guards against `makeNonce`/raw-nonce returning — it will
   fail by design once the nonce is back). New source assertions:
   - `nonce: hashed` is passed to `signInAsync`.
   - `nonce: raw` is passed to `signInWithIdToken`.
   - **Regression guard:** the same identifier is not passed to both calls (the exact
     2026-06-08 bug).
2. **New unit test for `makeAppleNonce`** (jest, `expo-crypto` mocked to delegate to Node's
   `crypto` so the relationship is actually verified, not stubbed): `hashed === SHA256(raw)`
   cross-checked with Node `crypto`; `raw !== hashed`; two calls differ; `raw` is 64-hex.
3. **Mandatory device test before `eas submit`:** real Apple-ID login on the TestFlight
   build succeeds **and** email login still works (the single discriminating check from the
   incident memory). Do NOT release without this.

## Rollout & safety

- Cut a new `eas build --profile production` from `master` (it also finally carries the
  friend-request + status-drift fixes as embedded JS).
- `eas submit` → Apple review → phased App Store release with rollback readiness.
- No Supabase dashboard change (Apple provider accepts the nonce by default).
- Confirm the live served OTA on `master` is not relied on to deliver this — it can't.

## Out of scope

- Android / web Apple sign-in (iOS-only feature here).
- Any change to the email/password or other OAuth paths.
- Replay protection beyond the nonce (e.g. PKCE) — not needed for this flow.
