// supabase/functions/notify-venue-updates/index.ts
//
// Sends push notifications when a venue the user has saved publishes a new
// happy hour window or updates an existing one.
//
// Called by the happy_hour_windows_notify trigger (pg_net) on
// happy_hour_windows INSERT / UPDATE — see migration
// 20260914_notification_webhook_triggers.sql. The trigger only fires when a
// user-visible field changed, and this function re-checks with old_record so
// a bulk touch (updated_at, confirmed_at, re-sync) can never spam followers.
//
// Auth: x-notify-token, same as the cron-driven notify-* functions.
// verify_jwt = false in config.toml. 2026-09-14: before this the function was
// never wired to anything and had never run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { happyHourPublishedCopy, happyHourUpdatedCopy } from "../_shared/notification-copy.mjs";
import { eligibleVenueIds, pushGateMode } from "../_shared/push-gate.ts";

// Fields a follower would care about. Anything else changing is noise.
const VISIBLE_FIELDS = ["status", "start_time", "end_time", "dow", "label"] as const;

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

  // Token gate (same contract as the cron-driven notify-* functions).
  const provided = req.headers.get("x-notify-token") ?? "";
  const { data: expected, error: tokErr } = await supabase.rpc("get_notify_job_token");
  if (tokErr) {
    return new Response(JSON.stringify({ error: `token lookup failed: ${tokErr.message}` }), { status: 500 });
  }
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  // Payload from database webhook: { type, table, record, old_record }
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const record = payload.record ?? payload;
  const oldRecord = payload.old_record ?? null;
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

  // "New" = inserted as published, or transitioned into published.
  // "Updated" = already published and a visible field changed. Anything else
  // (updated_at bump, confirmed_at touch, re-sync) is dropped here.
  const wasPublished = oldRecord?.status === "published";
  const isNew = eventType === "INSERT" || !wasPublished;
  if (!isNew) {
    const changed = VISIBLE_FIELDS.some(
      (f) => JSON.stringify(oldRecord?.[f] ?? null) !== JSON.stringify(record?.[f] ?? null),
    );
    if (!changed) {
      return new Response(JSON.stringify({ sent: 0, reason: "no visible change" }));
    }
  }

  const eligible = await eligibleVenueIds(supabase, [venueId]);
  console.log(
    `[notify-venue] window=${windowId} venue=${venueId} ${isNew ? "NEW" : "UPDATED"} eligible=${eligible.has(venueId)} mode=${pushGateMode()}`,
  );
  if (!eligible.has(venueId)) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "venue not push-eligible" })
    );
  }

  // Fetch venue name
  const { data: venue } = await supabase
    .from("venues")
    .select("name")
    .eq("id", venueId)
    .maybeSingle();

  const venueName = venue?.name ?? null;

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
