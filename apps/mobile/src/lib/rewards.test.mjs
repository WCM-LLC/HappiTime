import assert from "node:assert/strict";
import test from "node:test";
import { REWARD_PRESETS, rewardLabel } from "./rewards.mjs";

test("preset keys and labels match the canonical list", () => {
  assert.deepEqual(REWARD_PRESETS, [
    { key: "house_draft", label: "A house draft" },
    { key: "well_cocktail", label: "A well cocktail" },
    { key: "five_off", label: "$5 off the tab" },
    { key: "free_appetizer", label: "A free appetizer" },
  ]);
});

test("rewardLabel maps keys, tolerates null/unknown", () => {
  assert.equal(rewardLabel("house_draft"), "A house draft");
  assert.equal(rewardLabel(null), null);
  assert.equal(rewardLabel("nope"), null);
});
