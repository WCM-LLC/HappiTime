import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReferralHandle } from "../apps/mobile/src/lib/referralHandle.mjs";
test("normalizes + validates handles", () => {
  assert.equal(normalizeReferralHandle("@JWill86"), "jwill86");
  assert.equal(normalizeReferralHandle("bad handle"), null);
  assert.equal(normalizeReferralHandle(42), null);
  assert.equal(normalizeReferralHandle("a"), null);
});
