// src/hooks/useUserNotifications.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { emitUnreadChanged } from "../lib/notificationsEvents";

export type UserNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

const PAGE_SIZE = 100;

// deno/eslint-friendly row mapper kept module-level for reuse in tests later
const rowToNotification = (r: any): UserNotification => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  data: (r.data ?? {}) as Record<string, unknown>,
  createdAt: r.created_at,
  readAt: r.read_at ?? null,
});

/**
 * Inbox list + read state for the Notifications segment. RLS scopes reads to
 * the owner; the explicit user_id filter is defense-in-depth. Updates are
 * column-limited to read_at by the DB grant.
 */
export function useUserNotifications() {
  const { user } = useCurrentUser();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // user_notifications isn't in the generated Database type yet (types are
    // stale repo-wide, not specific to this table); cast follows the
    // established pattern used elsewhere in apps/mobile for the same reason.
    const { data, error } = await (supabase as any)
      .from("user_notifications")
      .select("id, type, title, body, data, created_at, read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (!error) setNotifications((data ?? []).map(rowToNotification));
    setLoading(false);
    emitUnreadChanged();
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n))
    );
    await (supabase as any)
      .from("user_notifications")
      .update({ read_at: now })
      .eq("id", id)
      .is("read_at", null);
    emitUnreadChanged();
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    await (supabase as any)
      .from("user_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    emitUnreadChanged();
  }, [user?.id]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}
