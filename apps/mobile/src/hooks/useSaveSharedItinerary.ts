import { useCallback, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

export type SaveResult =
  | { ok: true; listId: string }
  | { ok: false; needsAuth: true }
  | { ok: false; error: string };

/**
 * Copies a shared itinerary (by its share token) into a new list owned by the
 * current user, via the copy_shared_itinerary RPC. Shared by SharedItineraryScreen
 * and the Map itinerary banner so both offer the identical Save behavior.
 */
export function useSaveSharedItinerary() {
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (token: string): Promise<SaveResult> => {
      if (!user?.id) return { ok: false, needsAuth: true };
      setSaving(true);
      try {
        // Cast: generated DB types predate this RPC (migration 20260609220000).
        const { data, error } = await (supabase as any).rpc("copy_shared_itinerary", {
          p_token: token,
        });
        if (error || !data) {
          return { ok: false, error: error?.message ?? "Could not save this itinerary." };
        }
        return { ok: true, listId: data as string };
      } catch {
        return { ok: false, error: "Could not save this itinerary." };
      } finally {
        setSaving(false);
      }
    },
    [user?.id]
  );

  return { saving, save };
}
