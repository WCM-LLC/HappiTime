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
