import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type VenueMediaItem = {
  id: string;
  url: string;
  type: string;
  title: string | null;
  sort_order: number;
};

/**
 * Load all published media for a single venue, sorted by sort_order.
 */
export function useVenueMedia(venueId: string | null) {
  const [media, setMedia] = useState<VenueMediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!venueId) {
      setMedia([]);
      return;
    }

    setLoading(true);
    supabase
      .from("venue_media")
      .select("id, type, storage_bucket, storage_path, title, sort_order")
      .eq("venue_id", venueId)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (!data?.length) {
          setMedia([]);
          setLoading(false);
          return;
        }
        const items: VenueMediaItem[] = data.map((row: any) => {
          const { data: urlData } = supabase.storage
            .from(row.storage_bucket || "venue-media")
            .getPublicUrl(row.storage_path);
          return {
            id: row.id,
            url: urlData?.publicUrl || "",
            type: row.type as string,
            title: row.title,
            sort_order: row.sort_order,
          };
        });
        setMedia(items);
        setLoading(false);
      });
  }, [venueId]);

  return { media, loading };
}
