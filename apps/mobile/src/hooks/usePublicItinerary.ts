import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import type { ItineraryMapVenue } from "../navigation/types";

export type ItineraryVenue = ItineraryMapVenue & {
  itemId: string;
};

export type ItineraryHeader = {
  name: string;
  description: string | null;
  ownerId: string | null;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatar: string | null;
};

type State = {
  header: ItineraryHeader | null;
  venues: ItineraryVenue[];
  loading: boolean;
  error: string | null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

/**
 * Fetches the venues of a single itinerary (user_list) by its id, ordered the
 * way the author arranged them. Works for itineraries you do NOT own as long as
 * the parent list is public: the `user_list_items_select_owner_or_public` RLS
 * policy ("owner or public") gates the read, so no owner filter is needed here.
 *
 * Venue rows are mapped to the `ItineraryMapVenue` shape so the same array can
 * be handed straight to the Map tab's itinerary params.
 */
export function usePublicItinerary(listId: string | null | undefined) {
  const [state, setState] = useState<State>({
    header: null,
    venues: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!listId) {
      setState({ header: null, venues: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Header: the list row is readable when you own it, it's public, or it was
    // shared with you (the shared_itinerary_read_grant RLS grant). The author
    // profile is best-effort — a non-public profile simply resolves to null.
    const { data: listRow } = await (supabase as any)
      .from("user_lists")
      .select("id, name, description, user_id")
      .eq("id", listId)
      .maybeSingle();

    let header: ItineraryHeader | null = null;
    if (listRow) {
      let authorHandle: string | null = null;
      let authorDisplayName: string | null = null;
      let authorAvatar: string | null = null;
      if (listRow.user_id) {
        const { data: profile } = await (supabase as any)
          .from("user_profiles")
          .select("handle, display_name, avatar_url")
          .eq("user_id", listRow.user_id)
          .maybeSingle();
        authorHandle = profile?.handle ?? null;
        authorDisplayName = profile?.display_name ?? null;
        authorAvatar = profile?.avatar_url ?? null;
      }
      header = {
        name: listRow.name ?? "Itinerary",
        description: listRow.description ?? null,
        ownerId: listRow.user_id ?? null,
        authorHandle,
        authorDisplayName,
        authorAvatar,
      };
    }

    const { data, error } = await (supabase as any)
      .from("user_list_items")
      .select(
        `
        id,
        venue_id,
        sort_order,
        created_at,
        venue:venues(
          id,
          name,
          org_name,
          address,
          neighborhood,
          city,
          state,
          zip,
          timezone,
          tags,
          cuisine_type,
          price_tier,
          app_name_preference,
          status,
          lat,
          lng,
          phone,
          website,
          facebook_url,
          instagram_url,
          tiktok_url,
          promotion_tier,
          promotion_priority
        )
      `
      )
      .eq("list_id", listId);

    if (error) {
      setState({ header, venues: [], loading: false, error: error.message });
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    const sorted = [...rows].sort((a: any, b: any) => {
      const aOrder = typeof a.sort_order === "number" ? a.sort_order : 0;
      const bOrder = typeof b.sort_order === "number" ? b.sort_order : 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    });

    const venues: ItineraryVenue[] = sorted.flatMap((item: any) => {
      const venue = Array.isArray(item.venue) ? item.venue[0] : item.venue;
      if (!venue) return [];
      return [
        {
          itemId: item.id,
          id: venue.id ?? item.venue_id,
          name: venue.name ?? "Venue",
          org_name: venue.org_name ?? null,
          address: venue.address ?? null,
          neighborhood: venue.neighborhood ?? null,
          city: venue.city ?? null,
          state: venue.state ?? null,
          zip: venue.zip ?? null,
          timezone: venue.timezone ?? null,
          tags: Array.isArray(venue.tags) ? venue.tags : null,
          cuisine_type: venue.cuisine_type ?? null,
          price_tier: toNullableNumber(venue.price_tier),
          app_name_preference: venue.app_name_preference ?? null,
          status: venue.status ?? null,
          lat: toNullableNumber(venue.lat),
          lng: toNullableNumber(venue.lng),
          phone: venue.phone ?? null,
          website: venue.website ?? null,
          facebook_url: venue.facebook_url ?? null,
          instagram_url: venue.instagram_url ?? null,
          tiktok_url: venue.tiktok_url ?? null,
          promotion_tier: venue.promotion_tier ?? null,
          promotion_priority: toNullableNumber(venue.promotion_priority),
        },
      ];
    });

    setState({ header, venues, loading: false, error: null });
  }, [listId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    header: state.header,
    venues: state.venues,
    loading: state.loading,
    error: state.error,
    refresh: load,
  };
}
