# Mobile OTA Runbook

OTA updates were disabled 2026-07-01 (PR #103) after prod crashes during update
activation. Investigation (2026-07-29) concluded the crash class was **not an
expo-updates native bug**: the `errorRecoveryQueue` abort is expo-updates
re-raising a fatal error thrown by the update bundle itself at boot — and the
common cause (confirmed twice in our own history, e.g. the 2026-06-08 outage)
is a bundle exported **without the `EXPO_PUBLIC_*` env inlined**, because
`eas update` does not read `eas.json` build-profile env.

OTA is re-enabled starting with the **next store build** (the flags removed
from `app.json` are baked into each binary; 1.0.6/1.0.7 remain OTA-off
forever). This runbook is the required procedure once an OTA-capable build is
live.

## Invariants (guarded by `test/mobile-ota-config.test.mjs`)

- `apps/mobile/app.json` → `updates` contains only the update `url`
  (enabled + ON_LOAD checks are the defaults).
- `apps/mobile/eas.json` → `preview` profile: `channel: "preview"`,
  `environment: "production"`; `production` profile: `channel: "production"`,
  `environment: "production"`.
- The EAS **production environment** holds every `EXPO_PUBLIC_*` var the app
  reads (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`,
  `MAPS_API_KEY`). If code starts reading a new `EXPO_PUBLIC_*` var, add it
  with `eas env:create --environment production` **in the same PR**.

## Channel → branch mapping (trap)

- Channel `production` (baked into store builds) serves branch **`master`** —
  NOT a branch named "production". Publishing to `--branch production` reaches
  nobody.
- Channel `preview` (internal/TestFlight builds from the `preview` profile)
  serves branch `preview`.

## Publishing an OTA (from `apps/mobile`)

1. **Always pass `--environment production`** so the bundle is exported with
   the EAS server env, never just whatever `.env.local` happens to contain:

   ```sh
   eas update --branch preview --environment production --message "<what changed>"
   ```

2. **Verify on the preview build first.** Install the `preview`-profile build
   (internal distribution), launch, confirm the update activates, the app
   boots, and login works. This is the guardrail both incidents lacked.

3. **Verify the bundle env before promoting** — ask the update server what a
   device would get and check the manifest/bundle:

   ```sh
   curl -sS "https://u.expo.dev/11746dbf-de7c-408d-80c3-45859e657550" \
     -H "expo-channel-name: production" -H "expo-runtime-version: <appVersion>" \
     -H "expo-platform: ios" -H "Accept: multipart/mixed" -H "expo-protocol-version: 1"
   ```

   The returned update `id` is ground truth for what devices are served.

4. **Promote to production** (branch `master`, see trap above):

   ```sh
   eas update --branch master --environment production --message "<what changed>"
   ```

5. **Rollback**: `eas update:republish --group <previous-group-id>` to the
   same served branch, or `eas update:roll-back-to-embedded --branch master`.

## Notes

- `runtimeVersion.policy` is `appVersion`: an update only reaches binaries
  whose store version matches exactly.
- `expo-updates` was bumped to `~29.0.19` alongside re-enablement.
