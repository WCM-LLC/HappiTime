import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type DiscoverFeedItem = {
  id: string;
  createdAt: string;
  type: "checkin" | "itinerary_share";
  actorName: string;
  actorAvatar: string | null;
  actorHandle: string | null;
  isAnonymous: boolean;
  message: string;
  venueName?: string;
};


type FollowRow = { following_user_id: string };
type ProfileRow = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
};

type State = {
  items: DiscoverFeedItem[];
  loading: boolean;
  error: string | null;
};

export function useDiscoverFeed() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<State>({ items: [], loading: true, error: null });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ items: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { data: followRows, error: followError } = await (supabase as any)
      .from("user_follows")
      .select("following_user_id")
      .eq("follower_id", user.id)
      .eq("status", "accepted");

    if (followError) {
      setState({ items: [], loading: false, error: followError.message });
      return;
    }

    const followedIds = ((followRows ?? []) as FollowRow[]).map((r) => r.following_user_id);
    if (followedIds.length === 0) {
      setState({ items: [], loading: false, error: null });
      return;
    }

    const { data: profiles } = await (supabase as any)
      .from("user_profiles")
      .select("user_id, display_name, handle, avatar_url, is_public")
      .in("user_id", followedIds);

    const profileMap = new Map<string, ProfileRow>(((profiles ?? []) as ProfileRow[]).map((p) => [p.user_id, p]));

    const visibleIds = followedIds.filter((id) => {
      const profile = profileMap.get(id);
      return profile?.is_public !== false;
    });

    if (visibleIds.length === 0) {
      setState({ items: [], loading: false, error: null });
      return;
    }

    const [visitsRes, sharesRes] = await Promise.all([
      (supabase as any)
        .from("venue_visits")
        .select("id, user_id, entered_at, is_private, venue:venues(name)")
        .in("user_id", visibleIds)
        .order("entered_at", { ascending: false })
        .limit(50),
      (supabase as any)
        .from("user_events")
        .select("id, user_id, created_at, event_type, meta")
        .eq("event_type", "itinerary_share")
        .in("user_id", visibleIds)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (visitsRes.error) {
      setState({ items: [], loading: false, error: visitsRes.error.message });
      return;
    }

    if (sharesRes.error) {
      setState({ items: [], loading: false, error: sharesRes.error.message });
      return;
    }

    const checkins: DiscoverFeedItem[] = (visitsRes.data ?? []).map((row: any) => {
      const profile = profileMap.get(row.user_id);
      const actorName = profile?.display_name ?? profile?.handle ?? "HappiTime user";
      const venueName = row.venue?.name ?? "a venue";
      const isAnonymous = row.is_private === true;

      return {
        id: `checkin-${row.id}`,
        createdAt: row.entered_at,
        type: "checkin",
        actorName,
        actorAvatar: isAnonymous ? null : profile?.avatar_url ?? null,
        actorHandle: isAnonymous ? null : profile?.handle ?? null,
        isAnonymous,
        venueName,
        message: isAnonymous
          ? "a HappiTime user checked in"
          : `${actorName} checked in at ${venueName}`,
      };
    });

    const itineraryShares: DiscoverFeedItem[] = (sharesRes.data ?? []).map((row: any) => {
      const profile = profileMap.get(row.user_id);
      const actorName = profile?.display_name ?? profile?.handle ?? "HappiTime user";
      const actorHandle = profile?.handle ? `@${profile.handle}` : actorName;
      const itineraryName = row.meta?.list_name ?? "an itinerary";

      return {
        id: `share-${row.id}`,
        createdAt: row.created_at,
        type: "itinerary_share",
        actorName,
        actorAvatar: profile?.avatar_url ?? null,
        actorHandle: profile?.handle ?? null,
        isAnonymous: false,
        message: `${actorHandle} shared their itinerary ${itineraryName}`,
      };
    });

    const items = [...checkins, ...itineraryShares].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );

    setState({ items: items.slice(0, 100), loading: false, error: null });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
