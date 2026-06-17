// src/hooks/useVenueSearch.ts
import type { Venue } from "@happitime/shared-types";
import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

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
      } else {
        setVenues((data ?? []) as unknown as Venue[]);
      }
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  return { venues, loading };
}
