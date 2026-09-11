// src/hooks/useVenueSearch.ts
import type { Venue } from "@happitime/shared-types";
import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { fetchEffectiveTierRows, mergeEffectiveTiers } from "../lib/effectiveTier";
import { tierRank } from "../lib/venueTier";

// Field set mirrors what VenueCard / display helpers read so a venue-only
// search result renders identically to a happy-hour feed card.
const VENUE_FIELDS = `
  id,
  org_id,
  name,
  org_name,
  app_name_preference,
  address,
  neighborhood,
  city,
  state,
  zip,
  tags,
  price_tier,
  promotion_tier,
  promotion_priority,
  rating,
  review_count,
  lat,
  lng,
  status
`;

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 20;

/**
 * Featured -> verified -> listed, then promotion priority, then rating.
 * Ordering has to happen here rather than in the query: promotion_tier is
 * text with a custom rank, and the effective tier (org bundles) is not even a
 * column on venues. Without this the search returned rows in whatever order
 * Postgres produced them, so a Featured venue had no advantage — the bug that
 * left Vine Street Brewing below its own neighbors when searching "vine".
 */
function rankVenues(venues: Venue[]): Venue[] {
  return [...venues].sort((a, b) => {
    const r = tierRank((a as any).promotion_tier) - tierRank((b as any).promotion_tier);
    if (r !== 0) return r;
    const prio = ((b as any).promotion_priority ?? 0) - ((a as any).promotion_priority ?? 0);
    if (prio !== 0) return prio;
    return ((b as any).rating ?? 0) - ((a as any).rating ?? 0);
  });
}

/**
 * Searches *all* published venues by name/org/neighborhood/address/city.
 *
 * The home feed is built from happy-hour windows, so venues without a window
 * (e.g. arenas and event-only venues like T-Mobile Center) never appear there.
 * This hook backfills those into search results. It only hits the network when
 * the user is actively typing (>= 2 chars), debounced, and returns [] otherwise
 * so the default browse experience is unchanged.
 */
export function useVenueSearch(query: string): { venues: Venue[]; loading: boolean } {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setVenues([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    const handle = setTimeout(async () => {
      // Strip characters that would break the PostgREST or() filter grammar
      // (commas separate filters; % is the ilike wildcard we add ourselves).
      const safe = trimmed.replace(/[%,()]/g, " ").trim();
      if (!safe) {
        if (active) {
          setVenues([]);
          setLoading(false);
        }
        return;
      }
      const like = `%${safe}%`;

      const { data, error } = await supabase
        .from("venues")
        .select(VENUE_FIELDS)
        .eq("status", "published")
        .or(
          [
            `name.ilike.${like}`,
            `org_name.ilike.${like}`,
            `neighborhood.ilike.${like}`,
            `address.ilike.${like}`,
            `city.ilike.${like}`,
          ].join(",")
        )
        .limit(RESULT_LIMIT);

      if (!active) return;

      if (error) {
        console.warn("[useVenueSearch] venue search failed", error.message);
        setVenues([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as unknown as Venue[];

      // Fold in org-bundle tiers before ranking: a venue paying through a
      // bundle carries a null promotion_tier of its own and would otherwise
      // rank as "listed". Fail-open — a failed fetch leaves raw tiers.
      const withTiers = mergeEffectiveTiers(
        rows as unknown as Array<Venue & { id: string; promotion_tier?: string | null }>,
        await fetchEffectiveTierRows(rows.map((v) => (v as any).id)),
      ) as unknown as Venue[];

      if (!active) return;
      setVenues(rankVenues(withTiers));
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  return { venues, loading };
}
