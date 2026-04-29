import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type ActivityItem = {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  venueName: string;
  venueId: string;
  visitedAt: string;
  rating: number | null;
  comment: string | null;
};

type State = {
  activities: ActivityItem[];
  loading: boolean;
  error: string | null;
};

/**
 * Fetches activity from followed users, but ONLY at partner (subscribed) venues
 * where `promotion_tier` is not null. Only shows activity from public profiles
 * or users who have accepted the follow request.
 */
export function useFriendActivity() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<State>({
    activities: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ activities: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // 1. Get users we follow (only accepted follows)
      // NOTE: If user_follows does not have a status column yet, remove the .eq("status", "accepted") filter.
      // -- ALTER TABLE user_follows ADD COLUMN status text DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted'));
      const { data: followRows, error: followError } = await supabase
        .from("user_follows")
        .select("following_user_id")
        .eq("follower_id", user.id)
        .eq("status", "accepted");

      if (followError) {
        // Fallback: status column may not exist yet, try without filter
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("user_follows")
          .select("following_user_id")
          .eq("follower_id", user.id);

        if (fallbackError) {
          setState({ activities: [], loading: false, error: fallbackError.message });
          return;
        }

        return loadActivities(fallbackRows ?? [], user.id);
      }

      return loadActivities(followRows ?? [], user.id);
    } catch (err) {
      setState({
        activities: [],
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [user?.id]);

  async function loadActivities(
    followRows: { following_user_id: string }[],
    currentUserId: string
  ) {
    if (followRows.length === 0) {
      setState({ activities: [], loading: false, error: null });
      return;
    }

    const followedIds = followRows.map((r) => r.following_user_id);

    // 2. Get profiles of followed users to check is_public
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, display_name, handle, avatar_url, is_public")
      .in("user_id", followedIds);

    const profileMap = new Map(
      (profiles ?? []).map((p: {
        user_id: string;
        display_name: string | null;
        handle: string | null;
        avatar_url: string | null;
        is_public: boolean;
      }) => [p.user_id, p])
    );

    // Only include users with public profiles (or accepted follow — already filtered above)
    const visibleIds = followedIds.filter((id) => {
      const profile = profileMap.get(id);
      return profile?.is_public !== false;
    });

    if (visibleIds.length === 0) {
      setState({ activities: [], loading: false, error: null });
      return;
    }

    // 3. Fetch venue_visits for followed users at partner venues (promotion_tier is not null)
    // Only include rows the visit owner has not marked private
    const { data: visits, error: visitsError } = await supabase
      .from("venue_visits")
      .select(
        "id, user_id, venue_id, visited_at, rating, comment, venue:venues!inner(id, name, promotion_tier)"
      )
      .in("user_id", visibleIds)
      .not("venue.promotion_tier", "is", null)
      .eq("is_private" as any, false)
      .order("visited_at", { ascending: false })
      .limit(50);

    if (visitsError) {
      setState({ activities: [], loading: false, error: visitsError.message });
      return;
    }

    const activities: ActivityItem[] = (visits ?? []).map((v: any) => {
      const profile = profileMap.get(v.user_id);
      const displayName =
        profile?.display_name ?? profile?.handle ?? v.user_id.slice(0, 8);

      return {
        id: v.id,
        userId: v.user_id,
        userName: displayName,
        userAvatar: profile?.avatar_url ?? null,
        venueName: v.venue?.name ?? "Venue",
        venueId: v.venue_id,
        visitedAt: v.visited_at,
        rating: v.rating ?? null,
        comment: v.comment ?? null,
      };
    });

    setState({ activities, loading: false, error: null });
  }

  useEffect(() => {
    void load();
  }, [load]);

  return {
    activities: state.activities,
    loading: state.loading,
    error: state.error,
    refresh: load,
  };
}
