import { useEffect, useState, useCallback } from "react";
import { fetchVenueMenus, fetchWindowMenus, Menu } from "../api/menus";

export function useVenueMenus(
  venueId: string | null | undefined,
  windowId?: string | null
) {
  const [data, setData] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError(null);
    try {
      const menus = windowId
        ? await fetchWindowMenus(windowId, venueId)
        : await fetchVenueMenus(venueId);
      setData(menus);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [venueId, windowId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    loading,
    error,
    reload: load
  };
}
