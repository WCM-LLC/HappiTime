// Pure org-bundle sizing/pricing. No Stripe/DB calls — the deterministic core.
// bundle_2_4 = 2-4 venues @ $79/venue; bundle_5_plus = 5+ venues @ $59/venue.
export type BundleTier = "bundle_2_4" | "bundle_5_plus";

const RATE_CENTS: Record<BundleTier, number> = {
  bundle_2_4: 7900,
  bundle_5_plus: 5900,
};

/** Tier for a venue count; null when ineligible (<2). */
export function bundleTierForCount(n: number): BundleTier | null {
  if (n >= 5) return "bundle_5_plus";
  if (n >= 2) return "bundle_2_4";
  return null;
}

/** Per-venue monthly rate in cents. */
export function rateForBundleTier(tier: BundleTier): number {
  return RATE_CENTS[tier];
}

/** Preview a count change for the price-increase prompt (4-4). */
export function previewBundleChange(
  currentCount: number,
  delta: number
): { newCount: number; newTier: BundleTier | null; monthlyTotalCents: number } {
  const newCount = currentCount + delta;
  const newTier = bundleTierForCount(newCount);
  return {
    newCount,
    newTier,
    monthlyTotalCents: newTier ? rateForBundleTier(newTier) * newCount : 0,
  };
}
