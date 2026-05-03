import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type UserPreferences = {
  default_checkin_privacy: "private" | "friends" | null;
  home_city: string | null;
  home_state: string | null;
  home_lat: number | null;
  home_lng: number | null;
  max_distance_miles: number | null;
  price_tier_min: number | null;
  price_tier_max: number | null;
  cuisines: string[];
  notifications_push: boolean;
  notifications_happy_hours: boolean;
  notifications_venue_updates: boolean;
  notifications_friend_activity: boolean;
  notifications_product: boolean;
  notifications_marketing: boolean;
};

const DEFAULTS: UserPreferences = {
  default_checkin_privacy: null,
  home_city: null,
  home_state: null,
  home_lat: null,
  home_lng: null,
  max_distance_miles: null,
  price_tier_min: null,
  price_tier_max: null,
  cuisines: [],
  notifications_push: true,
  notifications_happy_hours: true,
  notifications_venue_updates: true,
  notifications_friend_activity: true,
  notifications_product: true,
  notifications_marketing: false,
};

type State = {
  preferences: UserPreferences;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

export function useUserPreferences() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<State>({
    preferences: DEFAULTS,
    loading: true,
    saving: false,
    error: null,
  });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return;
    }

    const d: any = data;
    setState({
      preferences: data
        ? {
            home_city: d.home_city ?? null,
            default_checkin_privacy:
              d.default_checkin_privacy === "friends" || d.default_checkin_privacy === "private"
                ? d.default_checkin_privacy
                : null,
            home_state: d.home_state ?? null,
            home_lat: d.home_lat ?? null,
            home_lng: d.home_lng ?? null,
            max_distance_miles: d.max_distance_miles ?? null,
            price_tier_min: d.price_tier_min ?? null,
            price_tier_max: d.price_tier_max ?? null,
            cuisines: Array.isArray(d.cuisines) ? d.cuisines : [],
            notifications_push: d.notifications_push ?? true,
            notifications_happy_hours: d.notifications_happy_hours ?? true,
            notifications_venue_updates: d.notifications_venue_updates ?? true,
            notifications_friend_activity: d.notifications_friend_activity ?? true,
            notifications_product: d.notifications_product ?? true,
            notifications_marketing: d.notifications_marketing ?? false,
          }
        : DEFAULTS,
      loading: false,
      saving: false,
      error: null,
    });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (!user?.id) return { error: new Error("Not signed in") };
      setState((prev) => ({ ...prev, saving: true, error: null }));

      const { error } = await (supabase as any)
        .from("user_preferences")
        .upsert({ user_id: user.id, ...patch } as any, { onConflict: "user_id" });

      if (error) {
        setState((prev) => ({ ...prev, saving: false, error: error.message }));
        return { error };
      }

      setState((prev) => ({
        ...prev,
        saving: false,
        preferences: { ...prev.preferences, ...patch },
      }));
      return { error: null };
    },
    [user?.id]
  );

  return {
    preferences: state.preferences,
    loading: state.loading,
    saving: state.saving,
    error: state.error,
    savePreferences,
  };
}
