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
  const [covers, setCovers] = useState<Record<string, string>>({});
  const idsKey = useMemo(() => [...venueIds].sort().join(","), [venueIds]);

  useEffect(() => {
    if (!idsKey) return;
    supabase
      .from("venue_media")
      .select("venue_id, storage_bucket, storage_path, sort_order, source")
      .in("venue_id", venueIds)
      .eq("status", "published")
      .eq("type", "image")
      .then(({ data }) => {
        if (!data?.length) return;

        // Group by venue and pick the highest-priority image
        const best: Record<string, typeof data[0]> = {};
        for (const row of data) {
          if (!row.venue_id || !row.storage_path || !row.storage_bucket) continue;
          const existing = best[row.venue_id];
          if (!existing) {
            best[row.venue_id] = row;
            continue;
          }
          const pa = SOURCE_PRIORITY[(row as any).source ?? "unknown"] ?? 4;
          const pb = SOURCE_PRIORITY[(existing as any).source ?? "unknown"] ?? 4;
          if (pa < pb || (pa === pb && row.sort_order < existing.sort_order)) {
            best[row.venue_id] = row;
          }
        }

        const map: Record<string, string> = {};
        for (const [venueId, row] of Object.entries(best)) {
          const { data: urlData } = supabase.storage
            .from(row.storage_bucket)
            .getPublicUrl(row.storage_path);
          if (urlData?.publicUrl) {
            map[venueId] = urlData.publicUrl;
          }
        }
        setCovers((prev) => ({ ...prev, ...map }));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return covers;
}
