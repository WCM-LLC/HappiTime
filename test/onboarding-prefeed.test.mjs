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
