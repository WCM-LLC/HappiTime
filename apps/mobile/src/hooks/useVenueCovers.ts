import { useEffect, useMemo, useState } from "react";
import { supabase } from "../api/supabaseClient";

export function useVenueCovers(venueIds: string[]): Record<string, string> {
  const [covers, setCovers] = useState<Record<string, string>>({});
  const idsKey = useMemo(() => [...venueIds].sort().join(","), [venueIds]);

  useEffect(() => {
    if (!idsKey) return;
    supabase
      .from("venue_media")
      .select("venue_id, storage_bucket, storage_path")
      .in("venue_id", venueIds)
      .eq("sort_order", 0)
      .eq("status", "published")
      .then(({ data }) => {
        if (!data?.length) return;
        const map: Record<string, string> = {};
        for (const row of data) {
          if (row.venue_id && row.storage_path && row.storage_bucket) {
            // Use supabase.storage to get the correct public URL
            const { data: urlData } = supabase.storage
              .from(row.storage_bucket)
              .getPublicUrl(row.storage_path);
            if (urlData?.publicUrl) {
              map[row.venue_id] = urlData.publicUrl;
            }
          }
        }
        setCovers((prev) => ({ ...prev, ...map }));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return covers;
}
