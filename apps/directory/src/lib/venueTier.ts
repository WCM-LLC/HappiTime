// Single source of truth for tier-aware consumer presentation (Phase 3).
//
// Maps the raw venues.promotion_tier value to one of three CONSUMER card
// variants and provides the sort/ordering rules. Both directory card components
// (VenueCard server + VenueCardClient) and the listing/sort sites import from
// here so the variant rules live in exactly one place.
//
// Tier → variant mapping (per the Phase 1 pricing model):
//   featured / founding_pilot / bundle_2_4 / bundle_5_plus  → "featured"
//     (founding_pilot and the org bundles grant featured-level capability)
//   verified                                                → "verified"
//   anything else / null ("listed")                         → "listed"

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

export type TierPresentation = {
  variant: TierVariant;
  /** Badge text, or null for listed (no badge). */
  label: string | null;
  /** True when the card should show the happy-hour menu preview block. */
  showMenuPreview: boolean;
};

/**
 * Presentation rules per variant. Visual styling (colors/classes) stays in the
 * card components; this returns the tier-driven *decisions* (label + which
 * sections render) so those decisions are defined once and unit-testable.
 *   featured → "★ Featured" pill, menu preview shown
 *   verified → "Verified ✓" pill, no menu preview
 *   listed   → no badge, no menu preview (compact)
 */
export function tierPresentation(
  promotionTier: string | null | undefined,
): TierPresentation {
  const variant = tierVariant(promotionTier);
  switch (variant) {
    case "featured":
      return { variant, label: "★ Featured", showMenuPreview: true };
    case "verified":
      return { variant, label: "Verified ✓", showMenuPreview: false };
    default:
      return { variant, label: null, showMenuPreview: false };
  }
}

const RANK: Record<TierVariant, number> = { featured: 0, verified: 1, listed: 2 };

/** Minimal shape the sort needs; VenueWithWindows satisfies it structurally. */
export type SortableVenue = {
  promotion_tier: string | null;
  promotion_priority: number;
  rating: number | null;
};

/**
 * Sort comparator: featured → verified → listed, then promotion_priority desc,
 * then rating desc. (Spec says "then review_count"; the directory venue query
 * doesn't select review_count, so rating is the available tiebreaker.)
 */
export function compareByTier(a: SortableVenue, b: SortableVenue): number {
  const r = RANK[tierVariant(a.promotion_tier)] - RANK[tierVariant(b.promotion_tier)];
  if (r !== 0) return r;
  const prio = (b.promotion_priority ?? 0) - (a.promotion_priority ?? 0);
  if (prio !== 0) return prio;
  return (b.rating ?? 0) - (a.rating ?? 0);
}

/**
 * Cap consecutive featured cards at `maxRun` (default 3): after a run of
 * featured venues, pull the next non-featured venue up to break the
 * "wall of featured", then continue. Pure and order-stable otherwise.
 * Input should already be sorted by compareByTier.
 */
export function capFeaturedRuns<T extends SortableVenue>(
  venues: T[],
  maxRun = 3,
): T[] {
  const featured: T[] = [];
  const rest: T[] = [];
  for (const v of venues) {
    (tierVariant(v.promotion_tier) === "featured" ? featured : rest).push(v);
  }
  if (featured.length <= maxRun || rest.length === 0) return venues;

  const out: T[] = [];
  let fi = 0;
  let ri = 0;
  while (fi < featured.length) {
    for (let k = 0; k < maxRun && fi < featured.length; k++) out.push(featured[fi++]);
    // Break the run with one non-featured venue, if any remain and more featured follow.
    if (fi < featured.length && ri < rest.length) out.push(rest[ri++]);
  }
  while (ri < rest.length) out.push(rest[ri++]);
  return out;
}

/** Convenience: sort then cap. */
export function orderVenuesForDisplay<T extends SortableVenue>(venues: T[]): T[] {
  return capFeaturedRuns([...venues].sort(compareByTier));
}
