// src/hooks/useUpcomingEvents.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type UpcomingEvent = {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  price_info: string | null;
  external_url: string | null;
  ticket_url: string | null;
  venues: {
    name: string | null;
    address: string | null;
    neighborhood: string | null;
    city: string | null;
    promotion_tier: string | null;
  } | null;
};

type State = {
  data: UpcomingEvent[];
  loading: boolean;
  error: Error | null;
};

export function useUpcomingEvents(limit = 40) {
  const [state, setState] = useState<State>({
    data: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, error } = await (supabase as any)
        .from("venue_events")
        .select(
          "id, venue_id, title, description, event_type, starts_at, ends_at, is_recurring, recurrence_rule, price_info, external_url, ticket_url, venues(name, address, neighborhood, city, promotion_tier)"
        )
        .eq("status", "published")
        .or(`starts_at.gte.${new Date().toISOString()},is_recurring.eq.true`)
        .order("starts_at", { ascending: true })
        .limit(limit);

      if (error) throw error;
      setState({
        data: (data ?? []) as UpcomingEvent[],
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err as Error }));
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
