# HappiTime Android App

This workspace is the Android-specific Expo app for HappiTime. It reuses the original React Native source from `apps/mobile` and owns Android release configuration such as the package id, Android permissions, EAS build profiles, and Play Console notes.

## Structure

- `App.tsx` re-exports `../mobile/App` so screens, navigation, API calls, auth, state, and UI behavior stay aligned with the original app.
- `app.json` contains Android-only native config.
- `app.config.js` injects Supabase and maps values from `.env`, `.env.local`, the repo root, or `apps/mobile` as a fallback.
- `metro.config.js` watches the monorepo and resolves shared packages plus the mobile `@/*` alias.

## Auth

- Apple SSO is not part of this Android app. The shared auth screen imports an iOS-only Apple button component that resolves to `null` on Android.
- Google sign-in uses Supabase OAuth with the app deep link redirect `happitime://auth/callback`.
- Supabase token and PKCE callback links are handled by `apps/mobile/src/hooks/useMagicLinkListener.ts`.

Before testing Google auth, configure Supabase Auth:

- Enable the Google provider in the Supabase dashboard.
- Add Google OAuth credentials to Supabase.
- Add `happitime://auth/callback` to Supabase Auth Redirect URLs.

## Environment

Copy `.env.example` to `.env` or `.env.local`.

Required:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Optional:

```bash
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_MAPS_PROVIDER=google
EXPO_PUBLIC_MAPS_API_KEY=
```

## Run Locally

### Prerequisites

1. **Android Studio** — installs the Android SDK to `~/Library/Android/sdk`.
2. **Java 17** — the Gradle build requires Java 17 specifically. Java 26+ is too new and will fail.
   ```bash
   brew install --cask temurin@17
   ```
3. **`ANDROID_HOME` and `PATH`** — add to `~/.zshrc` (or `~/.bashrc`):
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
   Then reload: `source ~/.zshrc`

### Start the emulator

Open **Android Studio → Device Manager** and start a virtual device (Pixel with a Google APIs image). Or check if one is already running:

```bash
~/Library/Android/sdk/platform-tools/adb devices
```

### Build and run

From the `apps/android` directory:

```bash
ANDROID_HOME=$HOME/Library/Android/sdk npx expo run:android
```

This compiles the native debug APK, installs it on the running emulator, and starts the Metro bundler. The first build takes ~5–10 minutes; subsequent builds use the Gradle cache and finish in ~1 minute.

> **Note:** Java 17 is pinned in `android/gradle.properties` via `org.gradle.java.home`, so you do not need to set `JAVA_HOME` manually as long as Temurin 17 is installed at the default path.

### Troubleshooting

**`spawn adb ENOENT`** — `ANDROID_HOME` is not set or `platform-tools` is not on `PATH`. Add the exports above and reload your shell.

**`Unsupported class file major version 70`** — Java 26 is being used. Install Java 17 (`brew install --cask temurin@17`) and verify `org.gradle.java.home` in `android/gradle.properties` points to it.

**`No development build installed`** — the APK hasn't been installed yet. Run `npx expo run:android` (not `expo start --android`) to build and install it first.

**Google Maps not showing** — the Maps API key must have the debug certificate fingerprint added in Google Cloud Console. Get the fingerprint:
```bash
keytool -list -v \
  -keystore android/app/debug.keystore \
  -alias androiddebugkey \
  -storepass android -keypass android
```
Then add an Android restriction to the key at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials using package `com.jwill7486.happitime.mobile` and the SHA-1 shown above. Also confirm **Maps SDK for Android** is in the key's allowed APIs.

## Build For Google Play

From the repo root:

```bash
npm run build:android
```

The production EAS profile is configured to produce an Android App Bundle (`.aab`). Upload that `.aab` to the existing Play Console app for package `com.jwill7486.happitime.mobile`.

## Play Console Troubleshooting

- "You need to upload an APK or Android App Bundle for this app." Upload the `.aab` from the production EAS build.
- "This release does not add or remove any app bundles." The release has no artifact selected. Add the new `.aab`.
- "You can't rollout this release because it doesn't allow any existing users to upgrade..." Make sure the uploaded artifact uses package `com.jwill7486.happitime.mobile`, is signed with the same Play app signing lineage, and has a `versionCode` greater than any version already released on that track.
- Advertising ID warning: this app does not include ad features, and `app.json` blocks `com.google.android.gms.permission.AD_ID`. Complete the Play Console Advertising ID declaration as "No" unless you later add an SDK that uses the advertising ID.

## Release Review Notes

The app requests foreground location, background location, foreground service location, and notifications because the existing mobile app tracks nearby happy hours and visit prompts. Google Play may require a background location declaration and review video before production release.
