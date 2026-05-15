// src/hooks/useUserCheckins.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type CheckInItem = {
  id: string;
  venue_id: string;
  venue_name: string;
  entered_at: string;
  source: string; // 'manual' | 'auto_proximity' | 'dwell'
  is_private: boolean;
  rating: number | null;
};

type State = {
  checkins: CheckInItem[];
  loading: boolean;
  error: string | null;
};

/**
 * Loads the current user's check-in history from venue_visits (newest first, max 100).
 * Exposes togglePrivacy for optimistic is_private updates with automatic rollback on failure.
 */
export function useUserCheckins() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<State>({
    checkins: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ checkins: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await (supabase as any)
        .from("venue_visits")
        .select("id, venue_id, entered_at, source, is_private, rating, venue:venues(name)")
        .eq("user_id", user.id)
        .order("entered_at", { ascending: false })
        .limit(100);

      if (error) {
        setState({ checkins: [], loading: false, error: error.message });
        return;
      }

      const checkins: CheckInItem[] = (data ?? []).map((row: any) => ({
        id: row.id,
        venue_id: row.venue_id,
        venue_name: row.venue?.name ?? "Venue",
        entered_at: row.entered_at,
        source: row.source ?? "manual",
        is_private: row.is_private ?? false,
        rating: row.rating ?? null,
      }));

      setState({ checkins, loading: false, error: null });
    } catch (err) {
      setState({
        checkins: [],
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [user?.id]);

  const togglePrivacy = useCallback(
    async (visitId: string, makePrivate: boolean) => {
      // Optimistic update
      setState((prev) => ({
        ...prev,
        checkins: prev.checkins.map((c) =>
          c.id === visitId ? { ...c, is_private: makePrivate } : c
        ),
      }));

      const { error } = await (supabase as any)
        .from("venue_visits")
        .update({ is_private: makePrivate })
        .eq("id", visitId)
        .eq("user_id", user?.id ?? "");

      if (error) {
        // Revert on failure
        setState((prev) => ({
          ...prev,
          checkins: prev.checkins.map((c) =>
            c.id === visitId ? { ...c, is_private: !makePrivate } : c
          ),
        }));
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    checkins: state.checkins,
    loading: state.loading,
    error: state.error,
    refresh: load,
    togglePrivacy,
  };
}
