// supabase/functions/_shared/notify.ts
//
// The one write path for user notifications: insert inbox rows first (the
// inbox is the source of truth even when Expo is down), then push to
// recipients who have a token and haven't disabled push. Callers resolve the
// recipient set user-first (category gates via notify-recipients.mjs) so
// token-less users still get inbox rows. Never throws.
//
// Push throttling (2026-09-15): consumer pushes were opened to every
// published venue on 2026-09-14, so a user following N venues could get N
// pushes in one hour. Two guards now sit between the inbox insert and Expo,
// both defined in push-policy.ts and tunable via env without a deploy:
//   - quiet hours   (PUSH_QUIET_HOURS, default 22-9 America/Chicago)
//   - daily cap     (PUSH_DAILY_CAP,   default 4 per user per Chicago day)
// The INBOX IS NEVER THROTTLED. Only the Expo push is suppressed, and rows
// that did go out get user_notifications.pushed_at stamped so the cap can be
// counted. Any failure in the bookkeeping fails OPEN (push still sent).

import { sendExpoPush, type ExpoPushMessage } from "./expo-push.ts";
import { allowedPushCount, chicagoDayStart, isQuietHours, policyFromEnv } from "./push-policy.ts";

const INSERT_BATCH = 500;
const COUNT_BATCH = 100; // users per pushed_at lookup; keeps rows well under PostgREST's max-rows

export type NotificationMessage = {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type NotifyResult = {
  /** Inbox rows written. */
  inserted: number;
  /** Expo messages accepted (one per device token). */
  pushed: number;
  /** Push-eligible users skipped because of quiet hours. */
  suppressedQuiet: number;
  /** Push-eligible users skipped because they hit today's cap. */
  suppressedCap: number;
};

export async function sendUserNotifications(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  recipients: { userId: string }[],
  msg: NotificationMessage,
  opts: { now?: Date } = {},
): Promise<NotifyResult> {
  const empty: NotifyResult = { inserted: 0, pushed: 0, suppressedQuiet: 0, suppressedCap: 0 };
  const userIds = [...new Set(recipients.map((r) => r.userId).filter(Boolean))];
  if (userIds.length === 0 || !msg.title || !msg.body) return empty;
  const data = msg.data ?? {};
  const now = opts.now ?? new Date();

  // 1) Inbox rows first. Keep the ids so pushed rows can be stamped later.
  let inserted = 0;
  const rowIdsByUser = new Map<string, string[]>();
  const rows = userIds.map((user_id) => ({
    user_id,
    type: msg.type,
    title: msg.title,
    body: msg.body,
    data,
  }));
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { data: insertedRows, error } = await supabase
      .from("user_notifications").insert(batch)
      .select("id, user_id");
    if (error) {
      console.error("[notify] inbox insert failed:", error.message);
      continue;
    }
    inserted += batch.length;
    // deno-lint-ignore no-explicit-any
    for (const r of (insertedRows ?? []) as any[]) {
      if (!r?.id || !r?.user_id) continue;
      const list = rowIdsByUser.get(r.user_id) ?? [];
      list.push(r.id);
      rowIdsByUser.set(r.user_id, list);
    }
  }

  // 2) Who is push-eligible at all: valid token and push not disabled.
  const [{ data: tokenRows }, { data: prefRows }] = await Promise.all([
    supabase.from("user_push_tokens").select("user_id, expo_push_token").in("user_id", userIds),
    supabase.from("user_preferences").select("user_id, notifications_push").in("user_id", userIds),
  ]);
  const pushDisabled = new Set(
    // deno-lint-ignore no-explicit-any
    (prefRows ?? []).filter((p: any) => p.notifications_push === false).map((p: any) => p.user_id),
  );
  const tokensByUser = new Map<string, string[]>();
  const seen = new Set<string>();
  // deno-lint-ignore no-explicit-any
  for (const row of (tokenRows ?? []) as any[]) {
    const token = row.expo_push_token;
    if (!token || !token.startsWith("ExponentPushToken")) continue;
    if (pushDisabled.has(row.user_id) || seen.has(token)) continue;
    seen.add(token);
    const list = tokensByUser.get(row.user_id) ?? [];
    list.push(token);
    tokensByUser.set(row.user_id, list);
  }
  const eligible = [...tokensByUser.keys()];

  // 3) Policy: quiet hours, then per-user daily cap.
  const policy = policyFromEnv();
  let suppressedQuiet = 0;
  let suppressedCap = 0;
  let allowed: string[] = eligible;

  if (
    eligible.length > 0 && policy.quiet &&
    isQuietHours(now, policy.tz, policy.quiet.startHour, policy.quiet.endHour)
  ) {
    suppressedQuiet = eligible.length;
    allowed = [];
  } else if (eligible.length > 0) {
    const pushedToday = await countPushedToday(supabase, eligible, chicagoDayStart(now, policy.tz));
    allowed = [];
    for (const uid of eligible) {
      if (allowedPushCount(pushedToday.get(uid) ?? 0, policy.dailyCap) > 0) allowed.push(uid);
      else suppressedCap++;
    }
  }

  // 4) Send only to allowed users.
  const messages: ExpoPushMessage[] = [];
  for (const uid of allowed) {
    for (const token of tokensByUser.get(uid) ?? []) {
      messages.push({ to: token, title: msg.title, body: msg.body, sound: "default", data });
    }
  }
  const pushed = await sendExpoPush(messages);

  // 5) Stamp pushed_at on the inbox rows of users we pushed. Expo accepts
  // per-batch of 100, so on a partial failure we cannot tell which users went
  // out; stamping all allowed users over-counts, which only ever makes the cap
  // stricter, never looser. Bookkeeping failure never blocks anything.
  if (pushed > 0 && allowed.length > 0) {
    const ids = allowed.flatMap((uid) => rowIdsByUser.get(uid) ?? []);
    if (ids.length > 0) {
      try {
        const { error } = await supabase
          .from("user_notifications")
          .update({ pushed_at: now.toISOString() })
          .in("id", ids);
        if (error) console.error("[notify] pushed_at update failed:", error.message);
      } catch (err) {
        console.error("[notify] pushed_at update threw:", err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(
    `[notify] type=${msg.type} inserted=${inserted} pushed=${pushed} quiet=${suppressedQuiet} capped=${suppressedCap}`,
  );
  return { inserted, pushed, suppressedQuiet, suppressedCap };
}

/**
 * Pushes already sent today per user (rows with pushed_at >= dayStart).
 * Fails open: a lookup error yields no counts, so nobody is capped.
 */
async function countPushedToday(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userIds: string[],
  dayStart: Date,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const since = dayStart.toISOString();
  for (let i = 0; i < userIds.length; i += COUNT_BATCH) {
    const chunk = userIds.slice(i, i + COUNT_BATCH);
    try {
      const { data, error } = await supabase
        .from("user_notifications")
        .select("user_id")
        .in("user_id", chunk)
        .gte("pushed_at", since);
      if (error) {
        console.error("[notify] pushed_at count failed (failing open):", error.message);
        continue;
      }
      // deno-lint-ignore no-explicit-any
      for (const r of (data ?? []) as any[]) {
        counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
      }
    } catch (err) {
      console.error("[notify] pushed_at count threw (failing open):", err instanceof Error ? err.message : err);
    }
  }
  return counts;
}
