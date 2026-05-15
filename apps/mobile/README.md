# Mobile App (Expo / React Native)

Canonical setup + docs live at repo root:
- `README.md`
- `ENV.md`
- `apps/ios/README.md` for iOS/Xcode ownership, signing, pods, and native capability notes

Quickstart (from repo root):
```bash
npm install
npm run dev:mobile
```

## Running a dev build on the iOS Simulator

This app uses a custom runtime (`runtimeVersion: { policy: "appVersion" }`), so **Expo Go cannot be used**. You need a native dev build installed on the simulator.

### First time (or after native dependency changes)

From `apps/mobile`:

```bash
# 1. Boot a simulator
xcrun simctl boot "iPhone 17 Pro"
open -a Simulator

# 2. Build the native app and install it on the booted simulator
npx expo run:ios --device "iPhone 17 Pro"
```

This compiles the Xcode project, installs the `.app` on the simulator, and starts Metro automatically. Takes ~5–10 minutes on first run; subsequent builds are incremental and much faster.

### Subsequent runs (no native changes)

```bash
# Start Metro and launch the already-installed app
npx expo start --ios
```

If Metro complains that a port is already in use:

```bash
# Kill stale Metro processes then retry
pkill -f metro; npx expo start --ios
```

### Publishing an OTA update

OTA updates apply to any installed build with a matching `runtimeVersion` (currently `1.0.1`):

```bash
eas update --auto --message "your message here"
```

Force-close and reopen the app on the device/simulator to apply the update.
