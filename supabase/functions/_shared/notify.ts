// supabase/functions/_shared/notify.ts
//
// The one write path for user notifications: insert inbox rows first (the
// inbox is the source of truth even when Expo is down), then push to
// recipients who have a token and haven't disabled push. Callers resolve the
// recipient set user-first (category gates via notify-recipients.mjs) so
// token-less users still get inbox rows. Never throws.

import { sendExpoPush, type ExpoPushMessage } from "./expo-push.ts";

const INSERT_BATCH = 500;

export type NotificationMessage = {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function sendUserNotifications(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  recipients: { userId: string }[],
  msg: NotificationMessage,
): Promise<{ inserted: number; pushed: number }> {
  const userIds = [...new Set(recipients.map((r) => r.userId).filter(Boolean))];
  if (userIds.length === 0 || !msg.title || !msg.body) return { inserted: 0, pushed: 0 };
  const data = msg.data ?? {};

  // 1) Inbox rows first.
  let inserted = 0;
  const rows = userIds.map((user_id) => ({
    user_id,
    type: msg.type,
    title: msg.title,
    body: msg.body,
    data,
  }));
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from("user_notifications").insert(batch);
    if (error) console.error("[notify] inbox insert failed:", error.message);
    else inserted += batch.length;
  }

  // 2) Push to recipients with a valid token and push enabled.
  const [{ data: tokenRows }, { data: prefRows }] = await Promise.all([
    supabase.from("user_push_tokens").select("user_id, expo_push_token").in("user_id", userIds),
    supabase.from("user_preferences").select("user_id, notifications_push").in("user_id", userIds),
  ]);
  const pushDisabled = new Set(
    // deno-lint-ignore no-explicit-any
    (prefRows ?? []).filter((p: any) => p.notifications_push === false).map((p: any) => p.user_id),
  );
  const seen = new Set<string>();
  const messages: ExpoPushMessage[] = [];
  // deno-lint-ignore no-explicit-any
  for (const row of (tokenRows ?? []) as any[]) {
    const token = row.expo_push_token;
    if (!token || !token.startsWith("ExponentPushToken")) continue;
    if (pushDisabled.has(row.user_id) || seen.has(token)) continue;
    seen.add(token);
    messages.push({ to: token, title: msg.title, body: msg.body, sound: "default", data });
  }
  const pushed = await sendExpoPush(messages);
  return { inserted, pushed };
}
