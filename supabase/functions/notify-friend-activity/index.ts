// supabase/functions/notify-friend-activity/index.ts
//
// Sends push notifications for friend-related activity:
//   - "follow"           → someone followed the user
//   - "venue_save"       → a friend saved a venue
//   - "itinerary_share"  → a friend shared an itinerary with the user
//
// Designed to be called from Supabase database webhooks on:
//   - user_follows INSERT         (event = "follow")
//   - user_events  INSERT         (event = "venue_save" | "itinerary_share")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Payload from database webhook: { type, table, record, old_record }
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const record = payload.record ?? payload;
  const table = payload.table ?? "";

  // ── Determine event kind and target user ──────────────────────────

  let event: "follow" | "venue_save" | "itinerary_share" | null = null;
  let actorId: string | null = null;   // person who did the action
  let targetId: string | null = null;  // person who receives the notification
  let meta: Record<string, unknown> = {};

  if (table === "user_follows") {
    // Someone followed a user
    event = "follow";
    actorId = record.follower_id ?? null;
    targetId = record.following_user_id ?? null;
  } else if (table === "user_events") {
    const eventType: string = record.event_type ?? "";

    if (eventType === "venue_save") {
      // A user saved a venue — notify their followers
      event = "venue_save";
      actorId = record.user_id ?? null;
      meta = { venueId: record.venue_id ?? null };
    } else if (eventType === "itinerary_share") {
      // A user shared an itinerary with someone
      event = "itinerary_share";
      actorId = record.user_id ?? null;
      targetId = (record.meta as any)?.shared_with_user_id ?? null;
      meta = {
        listId: (record.meta as any)?.list_id ?? null,
      };
    } else {
      return new Response(
        JSON.stringify({ sent: 0, reason: `ignored event_type: ${eventType}` })
      );
    }
  } else {
    return new Response(
      JSON.stringify({ sent: 0, reason: `unrecognized table: ${table}` })
    );
  }

  if (!actorId) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no actor id" })
    );
  }

  // ── Resolve actor display name ────────────────────────────────────

  const { data: actorProfile } = await supabase
    .from("user_profiles")
    .select("display_name, handle")
    .eq("id", actorId)
    .maybeSingle();

  const actorName =
    actorProfile?.display_name ??
    (actorProfile?.handle ? `@${actorProfile.handle}` : "Someone");

  // ── Collect target user IDs ───────────────────────────────────────

  let targetUserIds: string[] = [];

  if (event === "follow" || event === "itinerary_share") {
    // Single recipient
    if (targetId) targetUserIds = [targetId];
  } else if (event === "venue_save") {
    // Notify all followers of the actor.
    // Schema: follower_id follows following_user_id.
    // We want rows where following_user_id = actorId (people who follow the actor).
    const { data: followerRows } = await supabase
      .from("user_follows")
      .select("follower_id")
      .eq("following_user_id", actorId);

    targetUserIds = (followerRows ?? []).map((r: any) => r.follower_id);
  }

  if (targetUserIds.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no target users" })
    );
  }

  // ── Fetch push tokens + preference check ──────────────────────────

  const { data: tokenRows, error: tokenErr } = await supabase
    .from("user_push_tokens")
    .select("user_id, expo_push_token")
    .in("user_id", targetUserIds);

  if (tokenErr) {
    console.error("[notify-friend] token fetch failed:", tokenErr.message);
    return new Response(JSON.stringify({ error: tokenErr.message }), {
      status: 500,
    });
  }

  if (!tokenRows || tokenRows.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no push tokens" })
    );
  }

  // Check preferences — only send to users with push + friend activity enabled
  const userIds = [...new Set(tokenRows.map((r: any) => r.user_id))];
  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_push, notifications_friend_activity")
    .in("user_id", userIds);

  const disabledUsers = new Set(
    (prefRows ?? [])
      .filter(
        (p: any) =>
          p.notifications_push === false ||
          p.notifications_friend_activity === false
      )
      .map((p: any) => p.user_id)
  );

  // ── Build notification messages ───────────────────────────────────

  let title = "";
  let body = "";
  let navData: Record<string, unknown> = {};

  if (event === "follow") {
    title = `👋 New follower`;
    body = `${actorName} started following you`;
    navData = { type: "friend", actorId };
  } else if (event === "venue_save") {
    // Resolve venue name for a richer message
    const venueId = meta.venueId as string | null;
    let venueName = "a venue";
    if (venueId) {
      const { data: venue } = await supabase
        .from("venues")
        .select("name")
        .eq("id", venueId)
        .maybeSingle();
      venueName = venue?.name ?? "a venue";
    }
    title = `🍸 ${actorName} saved a spot`;
    body = `${actorName} saved ${venueName} — check it out!`;
    navData = { type: "venue", venueId: meta.venueId };
  } else if (event === "itinerary_share") {
    title = `📋 ${actorName} shared a list with you`;
    body = `Check out the itinerary ${actorName} put together`;
    navData = { type: "friend", actorId, listId: meta.listId };
  }

  const messages: ExpoPushMessage[] = [];
  for (const row of tokenRows as any[]) {
    const token = row.expo_push_token;
    if (!token || !token.startsWith("ExponentPushToken")) continue;
    if (disabledUsers.has(row.user_id)) continue;
    // Don't notify the actor about their own action
    if (row.user_id === actorId) continue;

    messages.push({
      to: token,
      title,
      body,
      sound: "default",
      data: navData,
    });
  }

  if (messages.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no valid tokens after filtering" })
    );
  }

  // ── Send in batches ───────────────────────────────────────────────

  let totalSent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (res.ok) totalSent += batch.length;
    else console.error("[notify-friend] expo push failed:", await res.text());
  }

  return new Response(JSON.stringify({ sent: totalSent }), {
    headers: { "Content-Type": "application/json" },
  });
});
