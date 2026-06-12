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
});

const checkin = readFileSync(new URL("../apps/mobile/src/hooks/useCheckin.ts", import.meta.url), "utf8");
test("check-in is gated: guest check-in records intent + requests sign-in", () => {
  assert.match(checkin, /requestSignIn\("checkin"\)/);
  assert.match(checkin, /setPendingIntent\(\{ kind: "checkin"/);
});

const resume = readFileSync(new URL("../apps/mobile/src/hooks/useGatedActionResume.ts", import.meta.url), "utf8");
const app3 = readFileSync(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");
test("resume replays the intent via FRESH signed-in hooks (no stale closure)", () => {
  // dispatches via this hook's own toggleFollow / _invoke (current user), keyed on user
  assert.match(resume, /takePendingIntent/);
  assert.match(resume, /toggleFollow\(intent\.venueId\)/);
  assert.match(resume, /_invoke\(intent\.body\)/);
  assert.match(app3, /useGatedActionResume\(\)/); // mounted at root
});
