// src/hooks/useVenueEvents.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { liveEventsSorted } from "../lib/eventSchedule";

export type VenueEventItem = {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  event_type: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
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
      // 2026-10-10: the server filter is deliberately loose and the precise
      // work happens in liveEventsSorted. Ordering by starts_at with a limit
      // (the old query) returned a venue's oldest recurring series first —
      // starts_at on a series is its FIRST date, not its next — so Venue
      // Preview's top three were always old weekly specials and a one-off on
      // tomorrow never appeared. Same bug class as #238 (Events tab).
      // The 24h look-back keeps an event that is under way right now.
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("venue_events")
        .select(
          "id, venue_id, title, description, event_type, status, starts_at, ends_at, timezone, is_recurring, recurrence_rule, price_info, external_url, ticket_url, cover_image_path"
        )
        .eq("venue_id", venueId)
        .eq("status", "published")
        .or(`starts_at.gte.${cutoff},is_recurring.eq.true`)
        .limit(200);

      if (error) throw error;

      setState({
        // Drops finished one-offs and ended series; sorts by next occurrence.
        data: liveEventsSorted((data ?? []) as VenueEventItem[]),
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
