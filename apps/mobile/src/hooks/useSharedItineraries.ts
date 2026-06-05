import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type SharedItinerary = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  ownerId: string;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatar: string | null;
};

type State = {
  itineraries: SharedItinerary[];
  loading: boolean;
  error: string | null;
};

/**
 * Lists the itineraries other users have shared directly with the current user.
 *
 * Backed by the `list_itineraries_shared_with_me` SECURITY DEFINER RPC: shares
 * live in user_events, which is owner-only readable, so a recipient cannot
 * enumerate them with a normal select. The RPC only returns lists whose share
 * was authored by the list's owner (forgery-proof).
 */
export function useSharedItineraries() {
  const [state, setState] = useState<State>({
    itineraries: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { data, error } = await (supabase as any).rpc(
      "list_itineraries_shared_with_me"
    );

    if (error) {
      setState({ itineraries: [], loading: false, error: error.message });
      return;
    }

    const itineraries: SharedItinerary[] = (data ?? []).map((row: any) => ({
      id: row.list_id,
      name: row.name ?? "Itinerary",
      description: row.description ?? null,
      updatedAt: row.updated_at,
      ownerId: row.owner_id,
      authorHandle: row.author_handle ?? null,
      authorDisplayName: row.author_display_name ?? null,
      authorAvatar: row.author_avatar_url ?? null,
    }));

    setState({ itineraries, loading: false, error: null });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    itineraries: state.itineraries,
    loading: state.loading,
    error: state.error,
    refresh: load,
  };
}
