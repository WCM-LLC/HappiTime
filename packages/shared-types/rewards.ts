// Single source of truth for redeemable-reward presets. Every surface (owner
// console, directory badge, venue banner, mobile screens) renders labels from
// here. Presets only — no custom free text (by product decision).
export const REWARD_PRESETS = [
  { key: "house_draft", label: "A house draft" },
  { key: "well_cocktail", label: "A well cocktail" },
  { key: "five_off", label: "$5 off the tab" },
  { key: "free_appetizer", label: "A free appetizer" },
] as const;

export type RewardPresetKey = (typeof REWARD_PRESETS)[number]["key"];

export const REWARD_PRESET_KEYS: readonly string[] = REWARD_PRESETS.map((p) => p.key);

export function rewardLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return REWARD_PRESETS.find((p) => p.key === key)?.label ?? null;
}
