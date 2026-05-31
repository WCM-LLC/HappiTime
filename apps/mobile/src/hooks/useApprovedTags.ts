// src/hooks/useApprovedTags.ts
import { useEffect, useMemo, useState } from "react";
import { fetchApprovedTags } from "@happitime/shared-api";
import type { ApprovedTag } from "@happitime/shared-types";
import { supabase } from "../api/supabaseClient";

type State = {
  tags: ApprovedTag[];
  loading: boolean;
  error: Error | null;
};

// Session-level cache so every screen mounting the hook shares one fetch.
let cachedTags: ApprovedTag[] | null = null;
let inflight: Promise<ApprovedTag[]> | null = null;

/**
 * Loads the active approved_tags taxonomy once per session and groups it by
 * category, sorted by sort_order. Filtering is client-side so consumers only
 * pay for one round-trip per app lifetime.
 */
export function useApprovedTags() {
  const [state, setState] = useState<State>(() => ({
    tags: cachedTags ?? [],
    loading: cachedTags == null,
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;

    if (cachedTags != null) {
      return;
    }

    const promise =
      inflight ??
      (inflight = fetchApprovedTags({ supabase }).then((data) => {
        cachedTags = (data ?? []) as ApprovedTag[];
        return cachedTags;
      }));

    promise
      .then((data) => {
        if (cancelled) return;
        setState({ tags: data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        inflight = null;
        setState({
          tags: [],
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const byCategory = useMemo(() => {
    const grouped: Record<string, ApprovedTag[]> = {};
    for (const tag of state.tags) {
      const bucket = grouped[tag.category] ?? (grouped[tag.category] = []);
      bucket.push(tag);
    }
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.label.localeCompare(b.label);
      });
    }
    return grouped;
  }, [state.tags]);

  return {
    tags: state.tags,
    byCategory,
    loading: state.loading,
    error: state.error,
  };
}
