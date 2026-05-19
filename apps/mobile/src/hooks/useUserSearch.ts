import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type UserSearchResult = {
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

type State = {
  results: UserSearchResult[];
  loading: boolean;
  error: string | null;
};

const DEBOUNCE_MS = 300;

function normalizeQuery(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function useUserSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ results: [], loading: false, error: null });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (normalized: string) => {
    if (!normalized) {
      setState({ results: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { data, error } = await (supabase as any)
      .from("user_profiles")
      .select("user_id, handle, display_name, avatar_url, role")
      .eq("is_public", true)
      .not("handle", "is", null)
      .ilike("handle", `${normalized}%`)
      .order("handle")
      .limit(20);

    if (error) {
      setState({ results: [], loading: false, error: error.message });
      return;
    }

    const rows = (data ?? []) as UserSearchResult[];

    // Apply spec ordering: exact match first, then super_user, then alpha
    const sorted = [...rows].sort((a, b) => {
      const aExact = a.handle === normalized ? 1 : 0;
      const bExact = b.handle === normalized ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;
      const aSuper = a.role === "super_user" ? 1 : 0;
      const bSuper = b.role === "super_user" ? 1 : 0;
      if (bSuper !== aSuper) return bSuper - aSuper;
      return a.handle.localeCompare(b.handle);
    });

    setState({ results: sorted, loading: false, error: null });
  }, []);

  useEffect(() => {
    const normalized = normalizeQuery(query);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void search(normalized), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  return {
    query,
    setQuery,
    results: state.results,
    loading: state.loading,
    error: state.error,
  };
}
