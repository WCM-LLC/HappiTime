// src/hooks/useVenueMedia.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type VenueMediaItem = {
  id: string;
  venue_id: string;
  type: string;
  title: string | null;
  storage_path: string;
  sort_order: number;
};

type State = {
  data: VenueMediaItem[];
  loading: boolean;
  error: Error | null;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

export function getMediaPublicUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/venue-media/${storagePath}`;
}

export function useVenueMedia(venueId: string | null) {
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
        .from("venue_media")
        .select("id, venue_id, type, title, storage_path, sort_order")
        .eq("venue_id", venueId)
        .eq("status", "published")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      setState({
        data: (data ?? []) as VenueMediaItem[],
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
