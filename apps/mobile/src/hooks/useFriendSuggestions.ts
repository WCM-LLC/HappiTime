import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

export type FriendSuggestion = UserProfile & {
  shared_venue_name: string;
  visit_date: string;
};

type State = {
  suggestions: FriendSuggestion[];
  loading: boolean;
  error: string | null;
};

/**
 * Suggests friends based on proximity — users who visited the same venues
 * within an overlapping 1-hour window. Excludes users already followed.
 */
export function useFriendSuggestions() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<State>({
    suggestions: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ suggestions: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // 1. Get the current user's venue visits
      const { data: myVisits, error: visitsError } = await supabase
        .from("venue_visits")
        .select("venue_id, entered_at")
        .eq("user_id", user.id)
        .order("entered_at", { ascending: false })
        .limit(100);

      if (visitsError) {
        setState({ suggestions: [], loading: false, error: visitsError.message });
        return;
      }

      if (!myVisits || myVisits.length === 0) {
        setState({ suggestions: [], loading: false, error: null });
        return;
      }

      // 2. Get users the current user already follows
      const { data: followedRows } = await supabase
        .from("user_follows")
        .select("following_user_id")
        .eq("follower_id", user.id);

      const followedIds = new Set(
        (followedRows ?? []).map((r: { following_user_id: string }) => r.following_user_id)
      );

      // 3. For each visited venue, find other users who visited within a 1-hour window
      const candidateMap = new Map<
        string,
        { venue_id: string; venue_name: string; visit_date: string }
      >();

      for (const visit of myVisits) {
        const visitTime = new Date(visit.entered_at).getTime();
        const windowStart = new Date(visitTime - 60 * 60 * 1000).toISOString();
        const windowEnd = new Date(visitTime + 60 * 60 * 1000).toISOString();

        const { data: overlapping } = await supabase
          .from("venue_visits")
          .select("user_id, entered_at, venue:venues(name)")
          .eq("venue_id", visit.venue_id)
          .neq("user_id", user.id)
          .gte("entered_at", windowStart)
          .lte("entered_at", windowEnd)
          .limit(20);

        if (overlapping) {
          for (const row of overlapping) {
            const uid = row.user_id as string;
            if (followedIds.has(uid) || uid === user.id) continue;
            if (!candidateMap.has(uid)) {
              const venue = row.venue as { name: string } | null;
              candidateMap.set(uid, {
                venue_id: visit.venue_id,
                venue_name: venue?.name ?? "a venue",
                visit_date: row.entered_at as string,
              });
            }
          }
        }
      }

      if (candidateMap.size === 0) {
        setState({ suggestions: [], loading: false, error: null });
        return;
      }

      // 4. Fetch profiles for candidate users
      const candidateIds = Array.from(candidateMap.keys());
      const { data: profiles, error: profilesError } = await supabase
        .from("user_profiles")
        .select("user_id, display_name, handle, avatar_url")
        .in("user_id", candidateIds);

      if (profilesError) {
        setState({ suggestions: [], loading: false, error: profilesError.message });
        return;
      }

      const suggestions: FriendSuggestion[] = (profiles ?? []).map(
        (p: UserProfile) => {
          const match = candidateMap.get(p.user_id)!;
          return {
            ...p,
            shared_venue_name: match.venue_name,
            visit_date: match.visit_date,
          };
        }
      );

      setState({ suggestions, loading: false, error: null });
    } catch (err) {
      setState({
        suggestions: [],
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    suggestions: state.suggestions,
    loading: state.loading,
    error: state.error,
    refresh: load,
  };
}
