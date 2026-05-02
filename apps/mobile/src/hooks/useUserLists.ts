import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type UserList = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  item_count: number;
  created_at: string;
  updated_at: string;
};

type State = {
  lists: UserList[];
  loading: boolean;
  error: string | null;
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
      .select("id, name, description, visibility, created_at, updated_at, items:user_list_items(id)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      setState({ lists: [], loading: false, error: error.message });
      return;
    }

    const lists: UserList[] = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      item_count: Array.isArray(row.items) ? row.items.length : 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    setState({ lists, loading: false, error: null });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const createList = useCallback(
    async (name: string, description?: string): Promise<{ error: Error | null }> => {
      if (!user?.id) return { error: new Error("Not signed in") };

      const { error } = await supabase.from("user_lists").insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        visibility: "private",
      });

      if (error) return { error: new Error(error.message) };

      await load();
      return { error: null };
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
  };
}
