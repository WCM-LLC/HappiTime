import { useEffect, useMemo, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Constants from "expo-constants";

const manifestExtra = (Constants.manifest as any)?.extra;
const manifest2Extra = (Constants as any)?.manifest2?.extra;
const extra =
  (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ??
  manifestExtra ??
  manifest2Extra;

const SUPABASE_URL = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (extra?.supabaseUrl as string | undefined) ??
  ""
).replace(/\/$/, "");

export function useVenueCovers(venueIds: string[]): Record<string, string> {
  const [covers, setCovers] = useState<Record<string, string>>({});
  const idsKey = useMemo(() => [...venueIds].sort().join(","), [venueIds]);

  useEffect(() => {
    if (!idsKey) return;
    supabase
      .from("venue_media")
      .select("venue_id,storage_path")
      .in("venue_id", venueIds)
      .eq("sort_order", 0)
      .eq("status", "published")
      .then(({ data }) => {
        if (!data?.length) return;
        const map: Record<string, string> = {};
        for (const row of data) {
          if (row.venue_id && row.storage_path) {
            map[row.venue_id] = `${SUPABASE_URL}/storage/v1/object/public/venue-media/${row.storage_path}`;
          }
        }
        setCovers((prev) => ({ ...prev, ...map }));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return covers;
}
