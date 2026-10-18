# OTA Runtime Version Split Between the Two Mobile Workspaces — Finding

**Date:** 2026-10-09
**Status:** Finding. No fix proposed yet — the safe fix depends on what the live store
builds actually report, which cannot be read from this repo.
**Scope:** Release configuration only. No app code, no schema. Found while running
`/impeccable polish` on `apps/mobile` (PR #235); unrelated to that work.

## Why

`apps/mobile` and `apps/android` are two workspaces describing **one app**. They share
the slug, the EAS project, the bundle identifier and the update URL — and they declare
**different versions**, while both use `runtimeVersion: { policy: "appVersion" }`.

That policy derives the OTA runtime version *from the declared version*. Two versions
therefore mean two runtimes, and an update published for one cannot reach the other.

| | `apps/mobile/app.json` | `apps/android/app.json` |
|---|---|---|
| `slug` | `happyhour-mobile` | `happyhour-mobile` |
| `extra.eas.projectId` | `11746dbf-…57550` | `11746dbf-…57550` |
| `updates.url` | `u.expo.dev/11746dbf-…` | `u.expo.dev/11746dbf-…` |
| bundle id / package | `com.jwill7486.happitime.mobile` | `com.jwill7486.happitime.mobile` |
| `runtimeVersion.policy` | `appVersion` | `appVersion` |
| **`version`** | **`1.0.8`** | **`1.0.2`** |

`docs/ota-runbook.md` documents publishing **"from `apps/mobile`"**. An `eas update` run
there resolves `runtimeVersion` to `1.0.8`.

`CLAUDE.md` records that `apps/android` "owns the package id, the Android permissions,
the EAS build profiles and the Play Console notes" — so Android store builds come from
the workspace declaring `1.0.2`.

If both of those hold, an OTA published per the runbook reaches iOS clients and **cannot
match an Android client**, because expo-updates will not serve an update whose runtime
version differs from the running build's.

### Evidence

Native directories are gitignored (`apps/mobile/.gitignore:42`, `apps/android/.gitignore:12`),
so EAS regenerates them from `app.json` on every build. The local copies are stale
prebuild artifacts from this machine and are **not** evidence about production. One of
them is worth recording anyway, because it shows what the Android workspace generates:

A local `expo run:android` from `apps/android` on 2026-10-09 produced, from
`apps/android/app.json` alone:

```
app/src/main/res/values/strings.xml:  <string name="expo_runtime_version">1.0.2</string>
aapt2 dump badging app-debug.apk:     versionName='1.0.2'  versionCode='2'
AndroidManifest.xml:                  EXPO_UPDATE_URL = https://u.expo.dev/11746dbf-…
```

So the Android workspace does bake `1.0.2` as its runtime version, against the shared
update URL. That is the mechanism, confirmed locally.

(The stale `apps/mobile/ios/` tree on this machine reports `EXUpdatesRuntimeVersion 1.0.2`
and `CFBundleShortVersionString 1.0.3`. Being gitignored, it proves nothing about
production; it is noted only so the next person does not mistake it for more data.)

### The version story has drifted in the prose too

| Source | Version it states |
|---|---|
| `apps/mobile/app.json` | `1.0.8` |
| `apps/android/app.json` | `1.0.2` |
| `apps/mobile/README.md:49` | "currently `1.0.3`" |
| `docs/ota-runbook.md:12` | "`1.0.6`/`1.0.7` remain OTA-off forever" |

The runbook line is the useful one. It says OTA is re-enabled "starting with the **next
store build**", with 1.0.6 and 1.0.7 permanently excluded — which places the OTA-capable
era at 1.0.8 and later. `apps/android`'s **1.0.2 predates even the OTA-off builds.**

That points at one of two explanations, and they call for different fixes:

1. **`apps/android/app.json`'s version is simply unmaintained** — Android store builds are
   in fact produced from `apps/mobile`, and this file's version has sat untouched while
   the real one moved. Then the fix is to converge or remove the stale declaration.
2. **Android really does ship from `apps/android`** — in which case the Android app is on
   a runtime version from before the OTA work, and the `channel`/`environment` gaps below
   mean it was never wired for updates at all.

`CLAUDE.md` says `apps/android` "owns … the EAS build profiles", which favours (2). The
`apps/mobile/README.md` figure being stale too suggests nobody has reconciled these
numbers in a while, which favours (1). This document does not pick between them, because
`eas build:list` answers it in one command and guessing does not.

## A second gap, same area

`test/mobile-ota-config.test.mjs` guards the invariants that came out of the PR #103
incident — OTA was disabled after prod crashes during update activation, traced to update
bundles exported without `EXPO_PUBLIC_*` env. Its assertions read **only**
`apps/mobile/app.json` and `apps/mobile/eas.json`:

```js
const appJson = readJson("apps/mobile/app.json");
const easJson = readJson("apps/mobile/eas.json");
```

`apps/android/eas.json` is unguarded, and it is missing both invariants the test exists
to enforce:

| Build profile | `channel` | `environment` |
|---|---|---|
| `apps/mobile` → `preview` | `preview` | `production` |
| `apps/mobile` → `production` | `production` | `production` |
| `apps/android` → `preview` | **absent** | **absent** |
| `apps/android` → `production` | **absent** | **absent** |

The missing `environment` is the precise condition the test's own comment blames for the
#103 crashes. The missing `channel` is what subscribes a build to its update branch.

## What is verified, and what is not

**Verified, in this repo:**
- The version, slug, projectId, bundle id, update URL and runtime policy values tabled above.
- That a build generated from `apps/android/app.json` bakes runtime version `1.0.2`.
- That the runbook documents publishing from `apps/mobile`.
- That `mobile-ota-config.test.mjs` reads only the `apps/mobile` pair.
- That `apps/android/eas.json` declares neither `channel` nor `environment`.

**Not verified, and not checkable from here:**
- What runtime version the **live store builds** actually report. That needs the EAS
  dashboard or `eas build:list`, i.e. credentials this session does not have.
- Which workspace the current App Store and Play Store builds were produced from.
- Whether any OTA has in fact been published since the versions diverged, and whether it
  reached both platforms. **This may be a latent trap rather than a live outage** — if no
  update has gone out since the split, nothing has broken yet.

Nobody should act on this as "Android OTA is broken" until the first two are answered. The
claim this document stands behind is narrower: **the two workspaces cannot both be right,
and nothing in CI would notice.**

## Suggested next steps

1. Read the truth from EAS before changing anything:
   `eas build:list --limit 10` and `eas update:list` for the project, and compare the
   runtime versions actually in the field.
2. Decide which version is canonical. Converging them is a release-affecting change —
   under `appVersion`, editing the version *is* editing the runtime version, so it
   orphans existing clients from future updates unless paired with a new store build.
3. Extend `test/mobile-ota-config.test.mjs` to read **both** workspaces. Note which
   assertions can land when:

   - *Passes today, worth adding now:* the two workspaces share `slug`, `projectId`,
     `updates.url` and bundle id, and both pin `runtimeVersion.policy: appVersion`.
     Those are the facts that make the version split matter, and pinning them stops the
     situation quietly changing shape underneath the finding.
   - *Fails today, must land with the fix:* "the two `version` values match", and
     "`apps/android`'s build profiles pin `channel` and `environment`". Adding either
     before the underlying fix turns CI red, which is why this document does not ship
     them. They are the assertions to write **in the same PR** as step 2.

4. If the versions are deliberately independent, say so in `docs/ota-runbook.md` and
   encode *that* as the assertion instead — a documented divergence is fine; an
   undocumented one is what this finding is about.

Only the first half of step 3 is safe on its own. Everything else waits on step 1, because
the right version number is a fact about the field, not about this repo.
