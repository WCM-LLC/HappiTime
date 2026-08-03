// src/hooks/useUserNotifications.ts
import { useCallback, useEffect, useRef, useState } from "react";
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

  // Latest known user id, updated after render so an in-flight refresh() can
  // tell — once its await resolves — whether it's still answering for the
  // active user (mirrors useCurrentUser's `active` flag; keyed on user id
  // here since a login right after a logout must also invalidate the old
  // response, not just an unmount).
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  const refresh = useCallback(async () => {
    const requestedUserId = user?.id ?? null;
    if (!requestedUserId) {
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
      .eq("user_id", requestedUserId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (requestedUserId !== userIdRef.current) return; // stale response — a different user is active now
    if (!error) setNotifications((data ?? []).map(rowToNotification));
    setLoading(false);
    emitUnreadChanged();
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    // Only rows that were actually unread before this call get reverted on
    // failure — a row already read (readAt already set) is left untouched.
    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id || n.readAt) return n;
        wasUnread = true;
        return { ...n, readAt: now };
      })
    );
    if (!wasUnread) return;

    const { error } = await (supabase as any)
      .from("user_notifications")
      .update({ read_at: now })
      .eq("id", id)
      .is("read_at", null);

    if (error) {
      // DB write failed (RLS denial, dropped connection, ...) — revert the
      // optimistic change so the UI reconverges with the actual DB state.
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: null } : n))
      );
    }
    emitUnreadChanged();
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    const revertIds = new Set<string>();
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.readAt) return n;
        revertIds.add(n.id);
        return { ...n, readAt: now };
      })
    );
    if (revertIds.size === 0) return;

    const { error } = await (supabase as any)
      .from("user_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      // Revert only the rows this call optimistically marked read — any row
      // marked read by a concurrent markRead() in between is left alone.
      setNotifications((prev) =>
        prev.map((n) => (revertIds.has(n.id) ? { ...n, readAt: null } : n))
      );
    }
    emitUnreadChanged();
  }, [user?.id]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}
