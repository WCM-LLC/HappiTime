import test from "node:test";
import assert from "node:assert/strict";
import { setPendingReferral, takePendingReferral } from "../apps/mobile/src/lib/pendingReferral.mjs";

test("stash returns once then clears", () => {
  assert.equal(takePendingReferral(), null);
  setPendingReferral("jwill86");
  assert.equal(takePendingReferral(), "jwill86");
  assert.equal(takePendingReferral(), null);
});
