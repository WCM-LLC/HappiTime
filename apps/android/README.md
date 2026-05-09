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

From the repo root:

```bash
npm install
npm run dev:android
```

To build and install a native debug app on an emulator or connected device:

```bash
npm run android
```

Native Android runs require:

- Android Studio with Android SDK Platform 35 or newer installed.
- `ANDROID_HOME` set to your Android SDK path.
- Android SDK `platform-tools` available on `PATH` so `adb` resolves.
- A running Android emulator or connected device with USB debugging enabled.
- A Java runtime compatible with the installed Android Gradle Plugin.

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
