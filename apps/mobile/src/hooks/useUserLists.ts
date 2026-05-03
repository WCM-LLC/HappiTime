import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type UserList = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  item_count: number;
  items: UserListItemPreview[];
  item_preview: UserListItemPreview[];
  created_at: string;
  updated_at: string;
};

export type UserListItemPreview = {
  id: string;
  venue_id: string;
  venue_name: string;
  venue: {
    id: string;
    name: string;
    org_name: string | null;
    address: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    timezone: string | null;
    tags: string[] | null;
    cuisine_type: string | null;
    price_tier: number | null;
    app_name_preference: string | null;
    status: string | null;
    lat: number | null;
    lng: number | null;
    promotion_tier: string | null;
    promotion_priority: number | null;
  } | null;
};

type State = {
  lists: UserList[];
  loading: boolean;
  error: string | null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export function useUserLists() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<State>({
    lists: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ lists: [], loading: false, error: null });
      return;
    }

    const { data, error } = await supabase
      .from("user_lists")
      .select(
        `
        id,
        name,
        description,
        visibility,
        created_at,
        updated_at,
        items:user_list_items(
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
            promotion_tier,
            promotion_priority
          )
        )
      `
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      setState({ lists: [], loading: false, error: error.message });
      return;
    }

    const lists: UserList[] = (data ?? []).map((row: any) => {
      const items = Array.isArray(row.items) ? row.items : [];
      const sortedItems = [...items].sort((a, b) => {
        const aOrder = typeof a.sort_order === "number" ? a.sort_order : 0;
        const bOrder = typeof b.sort_order === "number" ? b.sort_order : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
      });
      const mappedItems: UserListItemPreview[] = sortedItems
        .map((item: any) => {
          const venue = Array.isArray(item.venue) ? item.venue[0] : item.venue;
          return {
            id: item.id,
            venue_id: item.venue_id,
            venue_name: venue?.name ?? "Venue",
            venue: venue
              ? {
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
                  promotion_tier: venue.promotion_tier ?? null,
                  promotion_priority: toNullableNumber(venue.promotion_priority),
                }
              : null,
          };
        });
      const itemPreview = mappedItems.slice(0, 3);

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        visibility: row.visibility,
        item_count: items.length,
        items: mappedItems,
        item_preview: itemPreview,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    setState({ lists, loading: false, error: null });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const createList = useCallback(
    async (
      name: string,
      description?: string
    ): Promise<{ error: Error | null; listId?: string }> => {
      if (!user?.id) return { error: new Error("Not signed in") };

      const { data, error } = await supabase
        .from("user_lists")
        .insert({
          user_id: user.id,
          name: name.trim(),
          description: description?.trim() || null,
          visibility: "private",
        })
        .select("id")
        .single();

      if (error) return { error: new Error(error.message) };
      if (!data?.id) return { error: new Error("Couldn't create itinerary.") };

      await load();
      return { error: null, listId: data.id };
    },
    [user?.id, load]
  );

  const deleteList = useCallback(
    async (listId: string): Promise<{ error: Error | null }> => {
      if (!user?.id) return { error: new Error("Not signed in") };

      const { error } = await supabase
        .from("user_lists")
        .delete()
        .eq("id", listId)
        .eq("user_id", user.id);

      if (error) return { error: new Error(error.message) };

      await load();
      return { error: null };
    },
    [user?.id, load]
  );

  const updateList = useCallback(
    async (
      listId: string,
      updates: { name?: string; description?: string | null; visibility?: string }
    ): Promise<{ error: Error | null }> => {
      if (!user?.id) return { error: new Error("Not signed in") };

      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name.trim();
      if ("description" in updates) payload.description = updates.description?.trim() || null;
      if (updates.visibility !== undefined) payload.visibility = updates.visibility;

      const { error } = await (supabase as any)
        .from("user_lists")
        .update(payload as any)
        .eq("id", listId)
        .eq("user_id", user.id);

      if (error) return { error: new Error(error.message) };

      await load();
      return { error: null };
    },
    [user?.id, load]
  );

  const addVenue = useCallback(
    async (listId: string, venueId: string): Promise<{ error: Error | null }> => {
      if (!user?.id) return { error: new Error("Not signed in") };

      const { error } = await (supabase as any)
        .from("user_list_items")
        .upsert({ list_id: listId, venue_id: venueId }, { onConflict: "list_id,venue_id" });

      if (error) return { error: new Error(error.message) };

      await load();
      return { error: null };
    },
    [user?.id, load]
  );

  const removeVenue = useCallback(
    async (listId: string, venueId: string): Promise<{ error: Error | null }> => {
      if (!user?.id) return { error: new Error("Not signed in") };

      const { error } = await (supabase as any)
        .from("user_list_items")
        .delete()
        .eq("list_id", listId)
        .eq("venue_id", venueId);

      if (error) return { error: new Error(error.message) };

      await load();
      return { error: null };
    },
    [user?.id, load]
  );

  const shareWithFriend = useCallback(
    async (listId: string, targetUserId: string): Promise<{ error: Error | null }> => {
      if (!user?.id) return { error: new Error("Not signed in") };

      const listName = state.lists.find((l) => l.id === listId)?.name ?? null;
      const { data: profile } = await (supabase as any)
        .from("user_profiles")
        .select("handle")
        .eq("user_id", user.id)
        .maybeSingle();

      const { error } = await (supabase as any).from("user_events").insert({
        user_id: user.id,
        event_type: "itinerary_share",
        venue_id: null,
        meta: {
          list_id: listId,
          list_name: listName,
          shared_with_user_id: targetUserId,
          sharer_handle: profile?.handle ?? null,
        },
      });

      if (error) return { error: new Error(error.message) };
      return { error: null };
    },
    [state.lists, user?.id]
  );

  return {
    lists: state.lists,
    loading: state.loading,
    error: state.error,
    createList,
    updateList,
    deleteList,
    addVenue,
    removeVenue,
    shareWithFriend,
    refresh: load,
  };
}
