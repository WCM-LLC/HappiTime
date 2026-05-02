import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type DiscoverEventType =
  | "auto_checkin"
  | "itinerary_share"
  | "rating"
  | "comment"
  | "follow";

type EventMeta = {
  is_private?: boolean;
  itinerary_name?: string;
  venue_name?: string;
  comment_text?: string;
};

type UserProfile = {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

type DiscoverEventRow = {
  id: string;
  user_id: string;
  event_type: DiscoverEventType;
  created_at: string;
  meta: EventMeta | null;
  profile: UserProfile | UserProfile[] | null;
};

export type DiscoverFeedItem = {
  id: string;
  eventType: DiscoverEventType;
  createdAt: string;
  userHandle: string | null;
  userDisplayName: string | null;
  userAvatar: string | null;
  itineraryName: string | null;
  venueName: string | null;
  commentText: string | null;
  isPrivate: boolean;
};

type State = {
  feed: DiscoverFeedItem[];
  loading: boolean;
  error: string | null;
};

const DISCOVER_EVENT_TYPES: DiscoverEventType[] = [
  "auto_checkin",
  "itinerary_share",
  "rating",
  "comment",
  "follow",
];

export function useDiscoverFeed() {
  const [state, setState] = useState<State>({ feed: [], loading: true, error: null });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { data, error } = await (supabase as any)
      .from("user_events")
      .select(
        "id, user_id, event_type, created_at, meta, profile:user_profiles(display_name, handle, avatar_url)"
      )
      .in("event_type", DISCOVER_EVENT_TYPES)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      setState({ feed: [], loading: false, error: error.message });
      return;
    }

    const feed = ((data ?? []) as DiscoverEventRow[]).map((row) => {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return {
        id: row.id,
        eventType: row.event_type,
        createdAt: row.created_at,
        userHandle: profile?.handle ?? null,
        userDisplayName: profile?.display_name ?? null,
        userAvatar: profile?.avatar_url ?? null,
        itineraryName: row.meta?.itinerary_name ?? null,
        venueName: row.meta?.venue_name ?? null,
        commentText: row.meta?.comment_text ?? null,
        isPrivate: Boolean(row.meta?.is_private),
      };
    });

    setState({ feed, loading: false, error: null });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    feed: state.feed,
    loading: state.loading,
    error: state.error,
    refresh: load,
  };
}
