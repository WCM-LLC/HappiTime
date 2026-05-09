import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { venueImageUrl } from "../utils/mediaUrl";

export type VenueMediaItem = {
  id: string;
  url: string;
  title: string | null;
  sort_order: number;
  source: string;
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

    const SOURCE_PRIORITY: Record<string, number> = {
      upload: 0,
      website: 1,
      google_places: 2,
      unsplash: 3,
      unknown: 4,
    };

    setLoading(true);
    supabase
      .from("venue_media")
      .select("id, storage_bucket, storage_path, title, sort_order, source")
      .eq("venue_id", venueId)
      .eq("status", "published")
      .eq("type", "image")
      .then(({ data, error }) => {
        if (error) {
          console.warn("[useVenueMedia] query failed", error.message);
          setMedia([]);
          setLoading(false);
          return;
        }
        if (!data?.length) {
          setMedia([]);
          setLoading(false);
          return;
        }
        const items: VenueMediaItem[] = data
          .sort((a: any, b: any) => {
            const pa = SOURCE_PRIORITY[a.source ?? "unknown"] ?? 4;
            const pb = SOURCE_PRIORITY[b.source ?? "unknown"] ?? 4;
            if (pa !== pb) return pa - pb;
            return a.sort_order - b.sort_order;
          })
          .map((row: any) => ({
            id: row.id,
            url: venueImageUrl(
              { storage_bucket: row.storage_bucket || 'venue-media', storage_path: row.storage_path },
              { w: 1200 }
            ),
            title: row.title,
            sort_order: row.sort_order,
            source: row.source ?? "unknown",
          }));
        setMedia(items);
        setLoading(false);
      });
  }, [venueId]);

  return { media, loading };
}
