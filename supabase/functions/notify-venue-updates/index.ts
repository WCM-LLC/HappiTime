// supabase/functions/notify-venue-updates/index.ts
//
// Sends push notifications when a venue the user has saved publishes a new
// happy hour window or updates an existing one.
//
// Designed to be called from a Supabase database webhook on
// happy_hour_windows INSERT/UPDATE where status = 'published'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { happyHourPublishedCopy, happyHourUpdatedCopy } from "../_shared/notification-copy.mjs";

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
  const eventType = payload.type ?? "UPDATE"; // INSERT or UPDATE
  const venueId: string | null = record.venue_id ?? null;
  const windowId: string | null = record.id ?? null;
  const status: string | null = record.status ?? null;

  // Only notify for published windows
  if (status !== "published" || !venueId) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "not a published window or no venue" })
    );
  }


  const { data: sub } = await supabase
    .from("venue_subscriptions")
    .select("plan, status")
    .eq("venue_id", venueId)
    .maybeSingle();

  const isEligible = (sub?.plan === "featured" || sub?.plan === "founding_pilot") && sub?.status !== "inactive";
  if (!isEligible) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "venue is not a push-eligible subscriber" })
    );
  }

  // Fetch venue name
  const { data: venue } = await supabase
    .from("venues")
    .select("name")
    .eq("id", venueId)
    .maybeSingle();

  const venueName = venue?.name ?? "A venue you saved";

  // Followers of this venue, user-first: no token join, so token-less
  // followers still get inbox rows. Category pref gates the row.
  const { data: followerRows, error: followerErr } = await supabase
    .from("user_followed_venues")
    .select("user_id")
    .eq("venue_id", venueId);

  if (followerErr) {
    console.error("[notify-venue] follower fetch failed:", followerErr.message);
    return new Response(JSON.stringify({ error: followerErr.message }), { status: 500 });
  }

  const followerIds = [...new Set((followerRows ?? []).map((r: { user_id: string }) => r.user_id))];
  if (followerIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no followers" }));
  }

  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_venue_updates")
    .in("user_id", followerIds);

  const recipients = categoryGatedRecipients(followerIds, prefRows ?? [], "notifications_venue_updates");
  if (recipients.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "all followers opted out" }));
  }

  const isNew = eventType === "INSERT";
  const { title, body } = isNew
    ? happyHourPublishedCopy(venueName)
    : happyHourUpdatedCopy(venueName);

  const { inserted, pushed } = await sendUserNotifications(supabase, recipients, {
    type: "happy_hour",
    title,
    body,
    data: { type: "happy_hour", venueId, windowId },
  });

  return new Response(JSON.stringify({ inserted, sent: pushed }), {
    headers: { "Content-Type": "application/json" },
  });
});
