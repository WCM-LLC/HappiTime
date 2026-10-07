/**
 * Tier identity colors — the single source of truth.
 *
 * Before this existed, the owner panel and the admin tables each kept their own
 * map, and they disagreed: Verified rendered copper in one and stock blue in the
 * other, Featured rendered stock amber in one and copper in the other. Two maps
 * for one concept is what let them drift, so there is now one.
 *
 * Only the COLOR PAIR lives here. Geometry (radius, padding, font weight) stays
 * at the call site, because the panel and the tables legitimately differ there.
 *
 * The mapping is the reserved categorical palette from DESIGN.md:
 *   Listed          neutral        — unpaid, no identity colour
 *   Verified        Golden Hour    — the brand copper
 *   Featured        Oxblood        — the top per-venue tier
 *   Founding Pilot  Verdigris      — time-limited offer, reads as its own thing
 *   Bundles         Midnight Navy  — plural/institutional, shared by both sizes
 *
 * Every pair clears WCAG 2.1 AA for 12px text against its own ground:
 *   verified  4.51:1   featured 7.81:1   founding_pilot 5.67:1   bundles 9.13:1
 * The bases (`wine`, `teal`, `navy`) are too light to be text on their own
 * tints, which is why the `-ink` tokens exist. Never substitute the base.
 */

export type TierKey =
  | 'listed'
  | 'verified'
  | 'featured'
  | 'founding_pilot'
  | 'bundle_2_4'
  | 'bundle_5_plus';

/** Badge ground + text, for a pill rendered on either a card or a table row. */
export const TIER_BADGE_COLORS: Record<TierKey, string> = {
  listed: 'bg-background text-muted border border-border',
  verified: 'bg-brand-subtle text-brand-dark-alt',
  featured: 'bg-wine-subtle text-wine-ink',
  founding_pilot: 'bg-teal-subtle text-teal-ink',
  bundle_2_4: 'bg-navy-subtle text-navy-ink',
  bundle_5_plus: 'bg-navy-subtle text-navy-ink',
};

/**
 * Card border for the plan picker. Tier hue at low alpha so the card is
 * identifiable without a second saturated element competing with the badge.
 */
export const TIER_BORDER_COLORS: Record<TierKey, string> = {
  listed: 'border-border',
  verified: 'border-brand/40',
  featured: 'border-wine/40',
  founding_pilot: 'border-teal/40',
  bundle_2_4: 'border-navy/40',
  bundle_5_plus: 'border-navy/40',
};

/**
 * Border + ground + text for a control-sized chip — the plan link in the venue
 * header, which needs all three together plus a hover state.
 */
export const TIER_CHIP_COLORS: Record<TierKey, string> = {
  listed: 'border-border bg-surface text-muted hover:bg-background',
  verified: 'border-brand/30 bg-brand-subtle text-brand-dark-alt hover:bg-brand-subtle/80',
  featured: 'border-wine/30 bg-wine-subtle text-wine-ink hover:bg-wine-subtle/80',
  founding_pilot: 'border-teal/30 bg-teal-subtle text-teal-ink hover:bg-teal-subtle/80',
  bundle_2_4: 'border-navy/30 bg-navy-subtle text-navy-ink hover:bg-navy-subtle/80',
  bundle_5_plus: 'border-navy/30 bg-navy-subtle text-navy-ink hover:bg-navy-subtle/80',
};

function isTierKey(tier: string): tier is TierKey {
  return tier in TIER_BADGE_COLORS;
}

/** Badge colours for a tier that may be null or an unrecognised legacy value. */
export function tierBadgeColors(tier: string | null | undefined): string {
  return tier && isTierKey(tier) ? TIER_BADGE_COLORS[tier] : TIER_BADGE_COLORS.listed;
}

/** Border colours for a tier that may be null or an unrecognised legacy value. */
export function tierBorderColors(tier: string | null | undefined): string {
  return tier && isTierKey(tier) ? TIER_BORDER_COLORS[tier] : TIER_BORDER_COLORS.listed;
}

/** Chip colours for a tier that may be null or an unrecognised legacy value. */
export function tierChipColors(tier: string | null | undefined): string {
  return tier && isTierKey(tier) ? TIER_CHIP_COLORS[tier] : TIER_CHIP_COLORS.listed;
}
