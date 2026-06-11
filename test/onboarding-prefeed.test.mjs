import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const stash = readFileSync(new URL("../apps/mobile/src/lib/pendingReferral.ts", import.meta.url), "utf8");
const cap = readFileSync(new URL("../apps/mobile/src/hooks/useReferralCapture.ts", import.meta.url), "utf8");
test("pendingReferral is durable + first-wins + clear-on-take", () => {
  assert.match(stash, /AsyncStorage/);
  assert.match(stash, /if \(existing\) return;.*first-wins/s);
  assert.match(stash, /removeItem\(KEY\)/);
  assert.match(stash, /peekPendingReferral/);
});
test("useReferralCapture awaits takePendingReferral then records", () => {
  assert.match(cap, /await takePendingReferral\(\)/);
  assert.match(cap, /record_referral/);
});

const ctl = readFileSync(new URL("../apps/mobile/src/screens/onboarding/PreFeedOnboarding.tsx", import.meta.url), "utf8");
test("PreFeedOnboarding sequences splash -> location -> vibes -> onDone", () => {
  assert.match(ctl, /"splash"[\s\S]*"location"[\s\S]*"vibes"/);
  assert.match(ctl, /onDone\(\{ hood, vibes \}\)/);
});

const appsrc = readFileSync(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");
test("App gate shows PreFeedOnboarding for new guests + preserves login invariant", () => {
  assert.match(appsrc, /PreFeedOnboarding/);
  // LOGIN INVARIANT: the signin + skip branches must remain untouched.
  assert.match(appsrc, /guestChoice === "signin"[\s\S]*?<AuthScreen \/>/);
  assert.match(appsrc, /guestChoice === "skip"[\s\S]*?AppNavigator initialTab="Map"/);
  assert.match(appsrc, /markSeen\(\)[\s\S]*?setGuestChoice\("skip"\)/);
  assert.doesNotMatch(appsrc, /Create Account \/ Sign In/);
});
