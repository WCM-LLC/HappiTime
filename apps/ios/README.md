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
- SwiftUI Expo module: `apps/mobile/modules/happitime-ios-ui`
- App icons and launch screen: `apps/mobile/assets` and generated iOS asset catalogs

## Configured Capabilities

- Apple Sign-In: configured by `expo-apple-authentication`, `ios.usesAppleSignIn`, and `com.apple.developer.applesignin`.
- Push notifications: configured by `expo-notifications` and the `aps-environment` entitlement. APNs credentials still need to be managed through EAS or Apple Developer.
- Location: configured by `expo-location`. Runtime prompts are gated by onboarding/Profile preferences. Background location is declared because the existing visit tracker uses background location updates.
- Deep links: custom scheme `happitime` is configured for auth callbacks and in-app links.
- SwiftUI permission education: `happitime-ios-ui` exposes an Apple-only native SwiftUI panel to React Native. The existing Expo/TypeScript app still owns auth, onboarding state, permissions, navigation, and Supabase updates.
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

The SwiftUI module is autolinked from `apps/mobile/modules`. After editing
files in `apps/mobile/modules/happitime-ios-ui/ios`, run the pods command above
before building in Xcode or with `expo run:ios`.

Open the workspace in Xcode:

```bash
npm run xcode --workspace apps/ios
```

Run on a simulator from the repo root:

```bash
npm run build:shared
npm run ios --workspace apps/ios
```

For direct Xcode CLI verification, keep DerivedData outside cloud-synced or
file-provider-backed folders such as `~/Documents`:

```bash
xcodebuild \
  -workspace apps/mobile/ios/HappiTime.xcworkspace \
  -scheme HappiTime \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /private/tmp/HappiTimeSwiftUIVerificationDerivedData \
  -skipPackagePluginValidation \
  build
```

If codesign reports `resource fork, Finder information, or similar detritus not
allowed`, the generated app bundle is likely inheriting macOS file-provider
metadata from the build location. Use the `/private/tmp` DerivedData path above
or move the repo/build output outside synced Documents/Desktop folders.

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

## SwiftUI Boundary

The iOS app uses SwiftUI as a native presentation layer where it improves the
iPhone experience without duplicating shared product logic. Current SwiftUI
usage is limited to native permission/settings education panels. React Native
and shared TypeScript remain the source of truth for:

- Supabase auth and API calls.
- Onboarding progress and completion state.
- Permission request timing.
- Venue, happy hour, menu, profile, and preference data.
- Android and web behavior.

Do not move venue discovery, happy hour queries, menus, or auth into Swift
unless the app intentionally becomes native iOS-first. New SwiftUI surfaces
should emit events back to React Native rather than owning backend state.

## Release Notes

Do not move `apps/mobile/ios` into this folder unless the Expo app root and native build scripts are intentionally reworked together. Moving only the Xcode project would break CocoaPods paths, Expo autolinking, and `expo run:ios`.
