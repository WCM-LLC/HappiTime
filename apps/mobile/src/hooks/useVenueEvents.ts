// src/hooks/useVenueEvents.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type VenueEventItem = {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  event_type: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  price_info: string | null;
  external_url: string | null;
  ticket_url: string | null;
  cover_image_path: string | null;
};

type State = {
  data: VenueEventItem[];
  loading: boolean;
  error: Error | null;
};

export function useVenueEvents(venueId: string | null) {
  const [state, setState] = useState<State>({
    data: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!venueId) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase
        .from("venue_events")
        .select(
          "id, venue_id, title, description, event_type, status, starts_at, ends_at, is_recurring, recurrence_rule, price_info, external_url, ticket_url, cover_image_path"
        )
        .eq("venue_id", venueId)
        .eq("status", "published")
        .or(`starts_at.gte.${new Date().toISOString()},is_recurring.eq.true`)
        .order("starts_at", { ascending: true })
        .limit(20);

      if (error) throw error;

      setState({
        data: (data ?? []) as VenueEventItem[],
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err as Error,
      }));
    }
  }, [venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}
