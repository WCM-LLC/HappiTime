import { useEffect, useState, useCallback } from "react";
import { fetchVenueMenus, Menu } from "../api/menus";

export function useVenueMenus(venueId: string | null | undefined) {
  const [data, setData] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError(null);
    try {
      const menus = await fetchVenueMenus(venueId);
      setData(menus);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

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
