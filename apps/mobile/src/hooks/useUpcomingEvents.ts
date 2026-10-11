// src/hooks/useUpcomingEvents.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { fetchEffectiveTiers } from "../lib/effectiveTier";
import { isEventLive } from "../lib/eventSchedule";

export type UpcomingEvent = {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
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
      // 2026-10-09: one-off and recurring events are fetched separately.
      // starts_at on a recurring row is the date the series was ENTERED, so a
      // single query ordered by starts_at with a limit returned the oldest
      // recurring series first and never reached a one-off event: with ~144
      // published series the Events tab showed zero one-offs. The limit now
      // applies to one-offs only; recurring series are fetched in full and
      // expanded per day by the calendar screen as before.
      const COLUMNS =
        "id, venue_id, title, description, event_type, starts_at, ends_at, timezone, is_recurring, recurrence_rule, price_info, external_url, ticket_url, venues(name, address, neighborhood, city, promotion_tier)";
      const nowIso = new Date().toISOString();
      const [oneOffRes, recurringRes] = await Promise.all([
        (supabase as any)
          .from("venue_events")
          .select(COLUMNS)
          .eq("status", "published")
          .eq("is_recurring", false)
          .gte("starts_at", nowIso)
          .order("starts_at", { ascending: true })
          .limit(limit),
        (supabase as any)
          .from("venue_events")
          .select(COLUMNS)
          .eq("status", "published")
          .eq("is_recurring", true)
          .order("starts_at", { ascending: true })
          .limit(500),
      ]);
      if (oneOffRes.error) throw oneOffRes.error;
      if (recurringRes.error) throw recurringRes.error;
      // A series past its UNTIL (or its series-end ends_at) is still a
      // published row; without this it keeps appearing on its weekday forever.
      const now = new Date();
      const data = [...(oneOffRes.data ?? []), ...(recurringRes.data ?? [])].filter((e) =>
        isEventLive(e, now)
      );

      // Override each event venue's promotion_tier with the effective tier
      // (folds in the active org-bundle override). Keyed by event.venue_id since
      // the nested venues embed carries no id. Fail-open: empty map → raw tier.
      const events = data as UpcomingEvent[];
      const tierMap = await fetchEffectiveTiers(events.map((e) => e.venue_id));
      const eventsWithTiers =
        tierMap.size === 0
          ? events
          : events.map((e) =>
              e.venues && tierMap.has(e.venue_id)
                ? { ...e, venues: { ...e.venues, promotion_tier: tierMap.get(e.venue_id)! } }
                : e
            );

      setState({
        data: eventsWithTiers,
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
