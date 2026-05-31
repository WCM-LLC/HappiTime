// Mobile equivalent of the directory's tier-presentation helper (Phase 3).
// Separate workspace — cannot import the directory's @/lib/venueTier — so the
// pure mapping/sort logic is duplicated here. Keep the two in sync; the unit
// test test/venue-tier.test.mjs guards the shared invariants.
//
// Tier → consumer variant:
//   featured / founding_pilot / bundle_2_4 / bundle_5_plus  → "featured"
//   verified                                                → "verified"
//   anything else / null ("listed")                         → "listed"
// RN has no Tailwind classes, so this returns the variant + label only; the
// screen maps the variant to its StyleSheet entries.

export type TierVariant = "featured" | "verified" | "listed";

const FEATURED_LEVEL = new Set([
  "featured",
  "founding_pilot",
  "bundle_2_4",
  "bundle_5_plus",
]);

/** Collapse a raw promotion_tier into the consumer card variant. */
export function tierVariant(promotionTier: string | null | undefined): TierVariant {
  if (promotionTier && FEATURED_LEVEL.has(promotionTier)) return "featured";
  if (promotionTier === "verified") return "verified";
  return "listed";
}

/** Badge text per variant; null for listed (no badge). */
export function tierLabel(promotionTier: string | null | undefined): string | null {
  const v = tierVariant(promotionTier);
  if (v === "featured") return "Featured";
  if (v === "verified") return "Verified";
  return null;
}

/** True when this venue gets a promoted card treatment (featured or verified). */
export function isPromotedTier(promotionTier: string | null | undefined): boolean {
  return tierVariant(promotionTier) !== "listed";
}

const RANK: Record<TierVariant, number> = { featured: 0, verified: 1, listed: 2 };

/** Sort rank for a raw promotion_tier (lower = higher priority). */
export function tierRank(promotionTier: string | null | undefined): number {
  return RANK[tierVariant(promotionTier)];
}
