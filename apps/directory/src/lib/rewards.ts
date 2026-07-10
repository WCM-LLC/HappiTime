// Mirror of packages/shared-types/rewards.ts (the canonical registry).
// The directory app doesn't build that package's dist in its Vercel pipeline,
// so importing it resolves to un-built source and fails the webpack build. This
// self-contained mirror avoids any cross-package resolution. Keep the 4 presets
// byte-identical to the canonical list — the mobile parity test documents them.
export const REWARD_PRESETS = [
  { key: "house_draft", label: "A house draft" },
  { key: "well_cocktail", label: "A well cocktail" },
  { key: "five_off", label: "$5 off the tab" },
  { key: "free_appetizer", label: "A free appetizer" },
] as const;

export function rewardLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return REWARD_PRESETS.find((p) => p.key === key)?.label ?? null;
}
