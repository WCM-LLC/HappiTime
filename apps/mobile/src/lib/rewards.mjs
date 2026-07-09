// Mirror of packages/shared-types/rewards.ts. Kept in sync by rewards.test.mjs.
// Mobile can't import the TS package directly, so this mirror + parity test is
// the seam that prevents drift.
export const REWARD_PRESETS = [
  { key: "house_draft", label: "A house draft" },
  { key: "well_cocktail", label: "A well cocktail" },
  { key: "five_off", label: "$5 off the tab" },
  { key: "free_appetizer", label: "A free appetizer" },
];

export function rewardLabel(key) {
  if (!key) return null;
  const found = REWARD_PRESETS.find((p) => p.key === key);
  return found ? found.label : null;
}
