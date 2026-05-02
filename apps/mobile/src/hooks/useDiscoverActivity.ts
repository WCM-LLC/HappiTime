import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type DiscoverActivityItem = {
  id: string;
  actorId: string;
  actorHandle: string;
  actorAvatar: string | null;
  itineraryId: string;
  itineraryName: string;
  createdAt: string;
  message: string;
};

type State = { items: DiscoverActivityItem[]; loading: boolean; error: string | null };

export function useDiscoverActivity() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<State>({ items: [], loading: true, error: null });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ items: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { data, error } = await (supabase as any)
      .from("user_events")
      .select("id, user_id, created_at, meta")
      .eq("event_type", "itinerary_share")
      .eq("meta->>shared_with_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setState({ items: [], loading: false, error: error.message });
      return;
    }

    const actorIds = Array.from(new Set<string>((data ?? []).map((row: any) => row.user_id).filter((v: unknown): v is string => typeof v === "string")));
    const listIds = Array.from(new Set<string>((data ?? []).map((row: any) => row.meta?.list_id).filter((v: unknown): v is string => typeof v === "string")));

    const [{ data: profiles }, { data: lists }] = await Promise.all([
      supabase.from("user_profiles").select("user_id, handle, avatar_url").in("user_id", actorIds),
      (supabase as any).from("user_lists").select("id, name").in("id", listIds),
    ]);

    const profileById = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    const listById = new Map((lists ?? []).map((l: any) => [l.id, l]));

    const items: DiscoverActivityItem[] = (data ?? []).map((row: any) => {
      const actor = profileById.get(row.user_id);
      const handle = actor?.handle ?? "friend";
      const itineraryId = row.meta?.list_id ?? "";
      const itineraryName = row.meta?.list_name ?? (listById.get(itineraryId) as any)?.name ?? "itinerary";

      return {
        id: row.id,
        actorId: row.user_id,
        actorHandle: handle,
        actorAvatar: actor?.avatar_url ?? null,
        itineraryId,
        itineraryName,
        createdAt: row.created_at,
        message: `@${handle} shared their itinerary ${itineraryName}`,
      };
    });

    setState({ items, loading: false, error: null });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items: state.items, loading: state.loading, error: state.error, refresh: load };
}
