import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const opts = readFileSync(new URL("../apps/mobile/src/screens/auth/SignInOptions.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../apps/mobile/src/screens/AuthScreen.tsx", import.meta.url), "utf8");
test("SignInOptions keeps all three existing providers unchanged", () => {
  assert.match(opts, /AppleSignInButton/);
  assert.match(opts, /signInWithOAuth\(\{\s*provider:\s*"google"/);
  assert.match(opts, /signInWithOtp/);
});
test("AuthScreen renders SignInOptions (thin wrapper, providers not re-inlined)", () => {
  assert.match(auth, /<SignInOptions/);
});

const sheet = readFileSync(new URL("../apps/mobile/src/components/EarnedSignupSheet.tsx", import.meta.url), "utf8");
const gated = readFileSync(new URL("../apps/mobile/src/lib/gatedAction.ts", import.meta.url), "utf8");
const app2 = readFileSync(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");
test("gatedAction trigger + sheet reuse SignInOptions, wired at root, closes on session", () => {
  assert.match(gated, /requestSignIn/);
  assert.match(gated, /setSignInRequestHandler/);
  assert.match(sheet, /SignInOptions/);
  assert.match(app2, /EarnedSignupSheet/);
  assert.match(app2, /setSignInRequestHandler/);
  assert.match(app2, /setSignupKind\(null\)/); // closes on session
});

const follow = readFileSync(new URL("../apps/mobile/src/hooks/useUserFollowedVenues.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("../apps/mobile/src/lib/pendingGatedAction.ts", import.meta.url), "utf8");
test("save is gated: guest follow records intent + requests sign-in", () => {
  assert.match(follow, /requestSignIn\("save"\)/);
  assert.match(follow, /setPendingIntent\(\{ kind: "save"/);
  assert.match(queue, /takePendingIntent/);
  // Intent must be DURABLE (AsyncStorage) so it survives a magic-link cold start.
  assert.match(queue, /AsyncStorage/);
});

const checkin = readFileSync(new URL("../apps/mobile/src/hooks/useCheckin.ts", import.meta.url), "utf8");
test("check-in is gated: guest check-in requests sign-in (re-tapped, not auto-replayed)", () => {
  assert.match(checkin, /requestSignIn\("checkin"\)/);
});

const resume = readFileSync(new URL("../apps/mobile/src/hooks/useGatedActionResume.ts", import.meta.url), "utf8");
const app3 = readFileSync(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");
test("resume replays SAVE via a FRESH signed-in hook (no stale closure)", () => {
  // dispatches via this hook's own toggleFollow (current user), keyed on user
  assert.match(resume, /takePendingIntent/);
  assert.match(resume, /toggleFollow\(intent\.venueId\)/);
  assert.match(app3, /useGatedActionResume\(\)/); // mounted at root
});

const capture = readFileSync(new URL("../apps/mobile/src/components/PostSignupCapture.tsx", import.meta.url), "utf8");
const app4 = readFileSync(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");
test("PostSignupCapture: handle + referrer prefilled from durable stash, recorded", () => {
  assert.match(capture, /peekPendingReferral/);
  assert.match(capture, /record_referral/);
  assert.match(app4, /PostSignupCapture/);
});
