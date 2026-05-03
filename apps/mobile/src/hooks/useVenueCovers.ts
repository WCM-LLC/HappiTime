import { useEffect, useMemo, useState } from "react";
import { supabase } from "../api/supabaseClient";

const SOURCE_PRIORITY: Record<string, number> = {
  upload: 0,
  website: 1,
  google_places: 2,
  unsplash: 3,
  unknown: 4,
};

export function useVenueCovers(venueIds: string[]): Record<string, string> {
  const galleries = useVenueMediaGalleries(venueIds, 1);

  return useMemo(() => {
    const covers: Record<string, string> = {};
    for (const [venueId, urls] of Object.entries(galleries)) {
      if (urls[0]) covers[venueId] = urls[0];
    }
    return covers;
  }, [galleries]);
}

export function useVenueMediaGalleries(
  venueIds: string[],
  maxPerVenue = 8
): Record<string, string[]> {
  const [galleries, setGalleries] = useState<Record<string, string[]>>({});
  const idsKey = useMemo(() => [...venueIds].sort().join(","), [venueIds]);

  useEffect(() => {
    if (!idsKey) {
      setGalleries({});
      return;
    }

    let mounted = true;
    const ids = idsKey.split(",").filter(Boolean);

    const loadGalleries = async () => {
      try {
        const { data, error } = await supabase
          .from("venue_media")
          .select("id, venue_id, storage_bucket, storage_path, sort_order, source")
          .in("venue_id", ids)
          .eq("status", "published")
          .eq("type", "image");

        if (!mounted) return;

        if (error) {
          console.warn("[useVenueMediaGalleries] media lookup failed", error.message);
          setGalleries({});
          return;
        }

        const grouped: Record<string, any[]> = {};
        for (const row of data ?? []) {
          if (!row.venue_id || !row.storage_path) continue;
          grouped[row.venue_id] = grouped[row.venue_id] ?? [];
          grouped[row.venue_id].push(row);
        }

        const map: Record<string, string[]> = {};
        for (const [venueId, rows] of Object.entries(grouped)) {
          const urls = rows
            .sort((a, b) => {
              const pa = SOURCE_PRIORITY[a.source ?? "unknown"] ?? 4;
              const pb = SOURCE_PRIORITY[b.source ?? "unknown"] ?? 4;
              if (pa !== pb) return pa - pb;
              const sortA = Number(a.sort_order ?? 0);
              const sortB = Number(b.sort_order ?? 0);
              if (sortA !== sortB) return sortA - sortB;
              return String(a.id ?? "").localeCompare(String(b.id ?? ""));
            })
            .slice(0, maxPerVenue)
            .map((row) => {
              const { data: urlData } = supabase.storage
                .from(row.storage_bucket || "venue-media")
                .getPublicUrl(row.storage_path);
              return urlData?.publicUrl ?? "";
            })
            .filter(Boolean);

          if (urls.length > 0) {
            map[venueId] = urls;
          }
        }

        setGalleries(map);
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[useVenueMediaGalleries] media lookup failed", message);
        setGalleries({});
      }
    };

    void loadGalleries();

    return () => {
      mounted = false;
    };
  }, [idsKey, maxPerVenue]);

  return galleries;
}
