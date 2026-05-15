# HappiTime iOS

This folder is the iOS-specific workspace entrypoint for the HappiTime mobile app.

The app is an Expo React Native app. The canonical JavaScript and native runtime package lives in `apps/mobile`, and the generated Xcode project lives in `apps/mobile/ios`. That placement is intentional: Expo prebuild, autolinking, CocoaPods, and `expo run:ios` expect the native `ios` directory to sit beside the Expo app package.

`apps/ios` exists to keep iOS ownership, run commands, and setup notes discoverable without duplicating or moving the native project.

## Native Project

- Xcode workspace: `apps/mobile/ios/HappiTime.xcworkspace`
- Xcode project: `apps/mobile/ios/HappiTime.xcodeproj`
- Podfile: `apps/mobile/ios/Podfile`
- Entitlements: `apps/mobile/ios/HappiTime/HappiTime.entitlements`
- Info.plist: `apps/mobile/ios/HappiTime/Info.plist`
- App icons and launch screen: `apps/mobile/assets` and generated iOS asset catalogs

## Configured Capabilities

- Apple Sign-In: configured by `expo-apple-authentication`, `ios.usesAppleSignIn`, and `com.apple.developer.applesignin`.
- Push notifications: configured by `expo-notifications` and the `aps-environment` entitlement. APNs credentials still need to be managed through EAS or Apple Developer.
- Location: configured by `expo-location`. Runtime prompts are gated by onboarding/Profile preferences. Background location is declared because the existing visit tracker uses background location updates.
- Deep links: custom scheme `happitime` is configured for auth callbacks and in-app links.
- Universal links / associated domains: not enabled yet. Add only after the production domain has an Apple App Site Association file.

## Local iOS Setup

Install prerequisites:

```bash
npm install
brew install cocoapods
```

Prefer Homebrew CocoaPods on macOS. The system Ruby that ships with macOS
can be too old for current CocoaPods dependencies and may fail with an `ffi`
or `fffi requires Ruby version >= 3.0` error. If Homebrew is not available,
install a modern Ruby first with `rbenv`, `asdf`, or `mise`, then install
CocoaPods through that Ruby instead of `/usr/bin/ruby`.

If you already hit the system Ruby error, run:

```bash
brew install cocoapods
pod --version
```

Install pods when native dependencies or iOS config change:

```bash
npm run pods --workspace apps/ios
```

Open the workspace in Xcode:

```bash
npm run xcode --workspace apps/ios
```

Run on a simulator from the repo root:

```bash
npm run build:shared
npm run ios --workspace apps/ios
```

Start Metro for an installed development build:

```bash
npm run start --workspace apps/ios
```

## Signing Checklist

- Confirm bundle identifier: `com.jwill7486.happitime.mobile`.
- Set the Apple Developer Team in Xcode if the local team differs from the checked-in project.
- Confirm Sign in with Apple is enabled for the app identifier.
- Configure APNs credentials in EAS before production push notification testing.
- Add associated domains only when universal links are ready.

## Release Notes

Do not move `apps/mobile/ios` into this folder unless the Expo app root and native build scripts are intentionally reworked together. Moving only the Xcode project would break CocoaPods paths, Expo autolinking, and `expo run:ios`.
