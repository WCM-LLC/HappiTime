// src/hooks/useUnreadNotificationsBadge.ts
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { onUnreadChanged } from "../lib/notificationsEvents";

/**
 * Unread count for the Activity tab badge. Head-only count query (cheap under
 * the partial unread index). Refreshes on mount, app foreground, and any
 * mark-read via the notifications event bus.
 */
export function useUnreadNotificationsBadge(): number {
  const { user } = useCurrentUser();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    // user_notifications isn't in the generated Database type yet (types are
    // stale repo-wide, not specific to this table); cast follows the
    // established pattern used elsewhere in apps/mobile for the same reason.
    const { count: unread } = await (supabase as any)
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    setCount(unread ?? 0);
  }, [user?.id]);

  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    const off = onUnreadChanged(() => void load());
    return () => {
      sub.remove();
      off();
    };
  }, [load]);

  return count;
}
