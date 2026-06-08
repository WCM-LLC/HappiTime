import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");

const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

test("SwiftUI native module is Apple-only and Expo-autolinkable", () => {
  const config = JSON.parse(
    read("apps/mobile/modules/happitime-ios-ui/expo-module.config.json")
  );
  const podspec = read("apps/mobile/modules/happitime-ios-ui/ios/HappiTimeIOSUI.podspec");
  const moduleSource = read(
    "apps/mobile/modules/happitime-ios-ui/ios/HappiTimeIOSUIModule.swift"
  );

  assert.deepEqual(config.platforms, ["apple"]);
  assert.deepEqual(config.apple.modules, ["HappiTimeIOSUIModule"]);
  assert.match(podspec, /s\.dependency 'ExpoModulesCore'/);
  assert.match(moduleSource, /Name\("HappiTimeIOSUI"\)/);
  assert.match(moduleSource, /View\(HappiTimePermissionEducationView\.self\)/);
});

test("SwiftUI bridge is a progressive iOS enhancement with non-iOS fallback", () => {
  const bridge = read("apps/mobile/src/native/HappiTimeIOSUI.tsx");

  assert.match(bridge, /Platform\.OS === "ios"/);
  assert.match(bridge, /requireNativeView<NativeHappiTimeIOSPermissionPanelProps>\("HappiTimeIOSUI"\)/);
  assert.match(bridge, /return null/);
});

test("onboarding and profile keep permission state in React Native while using SwiftUI presentation", () => {
  const onboarding = read("apps/mobile/src/screens/OnboardingScreen.tsx");
  const profile = read("apps/mobile/src/screens/ProfileScreen.tsx");

  assert.match(onboarding, /HappiTimeIOSPermissionPanel/);
  assert.match(onboarding, /Location\.requestForegroundPermissionsAsync/);
  assert.match(onboarding, /Notifications\.requestPermissionsAsync/);
  assert.match(profile, /Linking\.openSettings\(\)/);
  assert.match(profile, /HappiTimeIOSPermissionPanel/);
});

test("native Apple sign-in sends the Apple identity token to Supabase without the broken nonce", () => {
  const appleSignIn = read("apps/mobile/src/components/AppleSignInButton.ios.tsx");

  // The Apple identity token must still be exchanged with Supabase.
  assert.match(
    appleSignIn,
    /signInWithIdToken\(\{\s*provider: "apple",\s*token: credential\.identityToken,\s*\}\)/s,
  );

  // Guard against reintroducing the bug that took down Apple login on 2026-06-08:
  // the *same raw* nonce was passed to both signInAsync (Apple) and signInWithIdToken
  // (Supabase). Supabase hashes its copy and compares it to the token's nonce claim
  // (the raw value Apple embedded), so they can never match and every login is rejected.
  // A correct nonce = SHA256(raw) to Apple, raw to Supabase — must be device-tested before
  // it returns. Until then, ensure neither the raw-nonce pattern nor makeNonce comes back.
  assert.doesNotMatch(appleSignIn, /makeNonce/);
  assert.doesNotMatch(appleSignIn, /signInAsync\(\{\s*nonce,/);
});
