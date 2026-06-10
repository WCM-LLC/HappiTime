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

test("native Apple sign-in uses a correct asymmetric nonce: SHA256(raw) to Apple, raw to Supabase", () => {
  const appleSignIn = read("apps/mobile/src/components/AppleSignInButton.ios.tsx");

  // A fresh nonce pair is generated up front.
  assert.match(appleSignIn, /const \{ raw, hashed \} = await makeAppleNonce\(\)/);

  // The HASH goes to Apple — Apple embeds it as the identity token's `nonce` claim.
  assert.match(appleSignIn, /signInAsync\(\{[\s\S]*?nonce: hashed[\s\S]*?\}\)/);

  // The RAW goes to Supabase — GoTrue hashes its copy and compares to the token's claim.
  assert.match(
    appleSignIn,
    /signInWithIdToken\(\{[\s\S]*?token: credential\.identityToken,[\s\S]*?nonce: raw[\s\S]*?\}\)/,
  );

  // Regression guard for the 2026-06-08 outage: the SAME raw nonce was sent to BOTH
  // calls, so the claim (raw) never equalled GoTrue's SHA256(raw) and every login failed.
  // Ensure the inverted wiring (raw→Apple or hashed→Supabase) cannot come back.
  // `[^})]*` keeps each negative match inside its own call's argument object.
  assert.doesNotMatch(appleSignIn, /signInAsync\(\{[^})]*nonce: raw\b/);
  assert.doesNotMatch(appleSignIn, /signInWithIdToken\(\{[^})]*nonce: hashed\b/);
});
