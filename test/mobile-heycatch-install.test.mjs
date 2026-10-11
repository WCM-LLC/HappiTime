/**
 * mobile-heycatch-install.test.mjs
 *
 * Guards the HeyCatch analytics install in the mobile app against the ways the
 * install guide (heycatch.ai/agents.md) says it silently loses events:
 *
 *  - `init` must run at module scope of the root entry file, from a static
 *    import. Nothing is queued before `init`, so a call that drifts into a
 *    component, an effect or a lazy import leaves earlier events untracked —
 *    and nothing looks broken when it does.
 *  - <HeyCatchProvider> must wrap the app exactly once (touch autocapture).
 *  - This app is on React Navigation, not Expo Router, so screen views are
 *    reported by hand from the NavigationContainer, skipping repeats.
 *
 * These are source-shape assertions plus one pure-logic test. They do not prove
 * events arrive — only a real device and the HeyCatch dashboard can.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createScreenViewTracker } from "../apps/mobile/src/lib/screenViewTracker.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const appTsx = read("apps/mobile/App.tsx");
const navigator = read("apps/mobile/src/navigation/AppNavigator.tsx");

test("init is a static import called at module scope of the root App.tsx", () => {
  assert.match(
    appTsx,
    /^import \{[^}]*\banalytics\b[^}]*\} from "@heycatch\/sdk";$/m,
    "App.tsx must statically import `analytics` from @heycatch/sdk",
  );
  assert.doesNotMatch(appTsx, /import\(\s*["']@heycatch\/sdk/, "no dynamic import of the SDK");

  const initAt = appTsx.indexOf("analytics.init(");
  assert.ok(initAt > 0, "analytics.init( not found in App.tsx");
  assert.equal(appTsx.indexOf("analytics.init(", initAt + 1), -1, "init must be called exactly once");

  // Module scope: the call sits before the first component/function in the file.
  const firstFunction = appTsx.search(/^(export default )?function \w+/m);
  assert.ok(firstFunction > 0);
  assert.ok(initAt < firstFunction, "analytics.init must run at module scope, above every component");
});

test("the project key is inlined as a publishable-key literal", () => {
  assert.match(appTsx, /projectKey:\s*"hck_pk_[A-Za-z0-9_-]+"/);
});

test("HeyCatchProvider wraps the app exactly once", () => {
  assert.equal((appTsx.match(/<HeyCatchProvider>/g) ?? []).length, 1);
  assert.match(appTsx, /<HeyCatchProvider>\s*<AppRoot \/>\s*<\/HeyCatchProvider>/);
});

test("identity is set on sign-in and reset on sign-out", () => {
  assert.match(appTsx, /identifyUser\(sessionUser\)/);
  assert.match(appTsx, /event === "SIGNED_OUT"\) clearIdentity\(\)/);
});

test("the navigation container reports screens on ready and on every change", () => {
  assert.match(navigator, /onReady=\{reportCurrentScreen\}/);
  assert.match(navigator, /onStateChange=\{reportCurrentScreen\}/);
  // Route NAME only. Params carry a share token (SharedItinerary) and the
  // user's coordinates (CheckIn); they must never ride along.
  assert.match(navigator, /getCurrentRoute\?\.\(\)\?\.name\)/);
  assert.doesNotMatch(navigator, /getCurrentRoute\?\.\(\)\?\.params/);
});

test("screen view tracker reports each distinct consecutive screen once", () => {
  const seen = [];
  const track = createScreenViewTracker((name) => seen.push(name));

  track("Map");
  track("Map"); // param update / tab re-press — same screen
  track("HappyHourDetail");
  track("Map"); // going back IS a new view
  track(undefined); // container not ready yet
  track("");
  track(42);

  assert.deepEqual(seen, ["Map", "HappyHourDetail", "Map"]);
});

test("both build workspaces declare the SDK and its Expo companions", () => {
  // Without expo-file-system the SDK cannot persist identity and every launch
  // looks like a new person (HeyCatch guide, React Native / Expo section).
  const mobile = JSON.parse(read("apps/mobile/package.json")).dependencies;
  const android = JSON.parse(read("apps/android/package.json")).dependencies;
  for (const pkg of [
    "@heycatch/sdk",
    "expo-file-system",
    "expo-application",
    "expo-device",
    "expo-localization",
  ]) {
    assert.ok(mobile[pkg], `apps/mobile is missing ${pkg}`);
    assert.equal(android[pkg], mobile[pkg], `apps/android must declare ${pkg} at mobile's range`);
  }
  assert.doesNotMatch(mobile["@heycatch/sdk"], /-/, "never a prerelease (-dev/-beta) SDK build");
});

test("HeyCatch identity is the account id only — no email or name", () => {
  // HeyCatch cannot delete a person, and identify events keep a copy of the
  // properties they carried, so personal properties sent here would outlive
  // account deletion (Codex P1 on #253). The bare id points at nothing once
  // delete-account has run.
  const lib = read("apps/mobile/src/lib/heycatch.ts");
  const identify = lib.slice(lib.indexOf("export function identifyUser"), lib.indexOf("export function clearIdentity"));
  assert.match(identify, /setIdentity\(\s*user\.id,\s*undefined,/);
  assert.doesNotMatch(identify, /email|full_name|user_metadata|display_name|\bname\b/);
  assert.doesNotMatch(appTsx, /sessionUserEmail/);
});

test("gate screens rendered outside AppNavigator report screen views", () => {
  for (const name of ["Auth", "PreFeedOnboarding", "Onboarding", "PostSignupCapture"]) {
    assert.match(appTsx, new RegExp(`<ScreenView name="${name}" />`), `${name} is not reported`);
  }
  // One shared reporter, so repeats are skipped across the gate → navigator hand-off.
  assert.match(navigator, /reportScreen\(navigationRef/);
});

test("the Expo web target gets a provider and trackScreen from the platform module", () => {
  // The SDK's browser entry (what Metro resolves on web) exports no
  // HeyCatchProvider and no analytics.trackScreen.
  assert.match(appTsx, /import \{ HeyCatchProvider \} from "\.\/src\/lib\/heycatchSdk";/);
  const web = read("apps/mobile/src/lib/heycatchSdk.web.tsx");
  assert.match(web, /export function HeyCatchProvider/);
  assert.match(web, /trackScreen\(name/);
});
