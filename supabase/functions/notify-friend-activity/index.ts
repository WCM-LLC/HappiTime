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
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { followCopy, venueSaveCopy, itineraryShareCopy } from "../_shared/notification-copy.mjs";

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

  // ── Resolve recipients user-first ─────────────────────────────────
  // Category pref gates the row itself; push gating happens inside the
  // helper. Token-less users still get inbox rows.

  const targetIds = [...new Set(targetUserIds)].filter((id) => id && id !== actorId);
  if (targetIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no target users" }));
  }

  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_friend_activity")
    .in("user_id", targetIds);

  const recipients = categoryGatedRecipients(targetIds, prefRows ?? [], "notifications_friend_activity");
  if (recipients.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "all recipients opted out" }));
  }

  // ── Build message ─────────────────────────────────────────────────

  let copy: { title: string; body: string };
  let type = "";
  let navData: Record<string, unknown> = {};

  if (event === "follow") {
    copy = followCopy(actorName);
    type = "friend";
    navData = { type: "friend", actorId };
  } else if (event === "venue_save") {
    const venueId = meta.venueId as string | null;
    let venueName: string | null = null;
    if (venueId) {
      const { data: venue } = await supabase
        .from("venues")
        .select("name")
        .eq("id", venueId)
        .maybeSingle();
      venueName = venue?.name ?? null;
    }
    copy = venueSaveCopy(actorName, venueName);
    type = "venue";
    navData = { type: "venue", venueId: meta.venueId };
  } else {
    copy = itineraryShareCopy(actorName);
    type = "itinerary";
    navData = { type: "itinerary", actorId, listId: meta.listId };
  }

  const { inserted, pushed } = await sendUserNotifications(supabase, recipients, {
    type,
    title: copy.title,
    body: copy.body,
    data: navData,
  });

  return new Response(JSON.stringify({ inserted, sent: pushed }), {
    headers: { "Content-Type": "application/json" },
  });
});
