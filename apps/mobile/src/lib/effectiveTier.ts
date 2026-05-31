// Mobile equivalent of the directory's effective-tier read (Phase 4-1b).
// Separate workspace — cannot import the directory's queries.ts — so the pure
// merge is duplicated here. test/venue-active-tier.test.mjs guards that this copy
// keeps the same shape and reads the same remote view (v_venue_active_tier),
// which folds in the active org-bundle override (see the SECURITY DEFINER
// org_active_bundle_tier function). The view is granted to anon + authenticated,
// so the mobile client (anon key, optionally a user session) reads it directly.
import { supabase } from "../api/supabaseClient";

type TierRow = { venue_id: string; tier: string | null };

/**
 * Override each venue's promotion_tier with the effective tier from the view.
 * A present row wins; a missing row leaves the venue untouched, so a failed/empty
 * fetch degrades to the raw promotion_tier (fail-open). Pure + unit-tested.
 */
export function mergeEffectiveTiers<T extends { id: string; promotion_tier?: string | null }>(
  venues: T[],
  tierRows: TierRow[]
): T[] {
  const byId = new Map(tierRows.map((r) => [r.venue_id, r.tier]));
  return venues.map((v) =>
    byId.has(v.id) ? { ...v, promotion_tier: byId.get(v.id) ?? v.promotion_tier } : v
  );
}

/**
 * Fetch effective-tier rows for the given venue ids. Fail-open: an error yields
 * []. Use with mergeEffectiveTiers for flat venue arrays.
 */
export async function fetchEffectiveTierRows(ids: string[]): Promise<TierRow[]> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return [];

  const { data, error } = await (supabase as any)
    .from("v_venue_active_tier")
    .select("venue_id, tier")
    .in("venue_id", unique);

  if (error) {
    console.warn("[effectiveTier] active-tier fetch failed", error.message);
    return [];
  }

  return (data ?? []) as TierRow[];
}

/**
 * Effective tiers as a Map, for overwriting venue objects nested at varied paths
 * across the mobile hooks (where the flat mergeEffectiveTiers does not apply).
 */
export async function fetchEffectiveTiers(ids: string[]): Promise<Map<string, string>> {
  const rows = await fetchEffectiveTierRows(ids);
  return new Map(
    rows.filter((r) => r.tier != null).map((r) => [r.venue_id, r.tier as string])
  );
}

/**
 * Venue ids whose EFFECTIVE tier is promoted (not 'listed') — i.e. partner
 * venues, now including those elevated by an active org bundle. Used by the
 * friend-activity feed, which filters to partner venues. Fail-open: [] on error.
 */
export async function fetchPromotedVenueIds(): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from("v_venue_active_tier")
    .select("venue_id")
    .neq("tier", "listed");

  if (error) {
    console.warn("[effectiveTier] promoted-venue fetch failed", error.message);
    return [];
  }

  return ((data ?? []) as { venue_id: string }[]).map((r) => r.venue_id);
}
