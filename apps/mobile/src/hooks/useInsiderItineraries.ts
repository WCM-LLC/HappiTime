import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type InsiderItinerary = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  authorId: string;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatar: string | null;
};

type State = {
  itineraries: InsiderItinerary[];
  loading: boolean;
  error: string | null;
};

/**
 * Fetches public itineraries authored by super_users, ordered newest first.
 * Two-step: get super_user profiles, then query their public lists.
 * Existing user_lists RLS ("owner or public") already allows authenticated reads.
 */
export function useInsiderItineraries() {
  const [state, setState] = useState<State>({
    itineraries: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Step 1: get all super_user profiles
    const { data: superUsers, error: profilesError } = await (supabase as any)
      .from("user_profiles")
      .select("user_id, handle, display_name, avatar_url")
      .eq("role", "super_user");

    if (profilesError) {
      setState({ itineraries: [], loading: false, error: profilesError.message });
      return;
    }

    const profiles = (superUsers ?? []) as {
      user_id: string;
      handle: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }[];

    if (profiles.length === 0) {
      setState({ itineraries: [], loading: false, error: null });
      return;
    }

    const superUserIds = profiles.map((p) => p.user_id);
    const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

    // Step 2: fetch their public itineraries
    const { data: lists, error: listsError } = await (supabase as any)
      .from("user_lists")
      .select("id, name, description, updated_at, user_id")
      .eq("visibility", "public")
      .in("user_id", superUserIds)
      .order("updated_at", { ascending: false })
      .limit(20);

    if (listsError) {
      setState({ itineraries: [], loading: false, error: listsError.message });
      return;
    }

    const itineraries: InsiderItinerary[] = (lists ?? []).map((l: any) => {
      const author = profileMap.get(l.user_id);
      return {
        id: l.id,
        name: l.name,
        description: l.description ?? null,
        updatedAt: l.updated_at,
        authorId: l.user_id,
        authorHandle: author?.handle ?? null,
        authorDisplayName: author?.display_name ?? null,
        authorAvatar: author?.avatar_url ?? null,
      };
    });

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
