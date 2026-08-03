// supabase/functions/notify-upcoming-events/index.ts
//
// Sends Expo push notifications to users who have favorited venues where a
// published event starts within the next 60 minutes.
//
// Invoked hourly by pg_cron via invoke_notify_events() SECURITY DEFINER
// wrapper, which sends x-notify-token.  verify_jwt = false in config.toml.
// Uses starts_at timestamptz (absolute instant) — no TZ-string issue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { eventStartingCopy } from "../_shared/notification-copy.mjs";

Deno.serve(async (req) => {
  // POST-only; cron invocations and manual triggers both POST
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

  // Token gate: cron sends x-notify-token; manual callers must do the same
  const provided = req.headers.get("x-notify-token") ?? "";
  const { data: expected, error: tokErr } = await supabase.rpc("get_notify_job_token");
  if (tokErr) {
    return new Response(
      JSON.stringify({ error: `token lookup failed: ${tokErr.message}` }),
      { status: 500 },
    );
  }
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  // Query events starting in the next 60 minutes (starts_at is timestamptz — TZ-safe)
  const nowIso = new Date().toISOString();
  const lookaheadIso = new Date(Date.now() + 60 * 60_000).toISOString();

  const { data: events, error: evErr } = await supabase
    .from("venue_events")
    .select("id, venue_id, title, starts_at, venue:venues(name)")
    .eq("status", "published")
    .gte("starts_at", nowIso)
    .lte("starts_at", lookaheadIso);

  if (evErr) {
    console.error("[notify-events] events fetch failed:", evErr.message);
    return new Response(JSON.stringify({ error: evErr.message }), { status: 500 });
  }

  if (!events || events.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no upcoming events" }));
  }

  const venueIds = [...new Set((events as any[]).map((e) => e.venue_id).filter(Boolean))];

  // Tier gate: only featured / founding_pilot venues get push (same as HH)
  const { data: eligibleSubs } = await supabase
    .from("venue_subscriptions")
    .select("venue_id, plan, status")
    .in("plan", ["featured", "founding_pilot"])
    .neq("status", "inactive")
    .in("venue_id", venueIds);

  const eligibleVenueIds = new Set((eligibleSubs ?? []).map((r: any) => r.venue_id));
  const eligibleEvents = (events as any[]).filter((e) => eligibleVenueIds.has(e.venue_id));

  if (eligibleEvents.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no push-eligible venues with upcoming events" }),
    );
  }

  const eligibleIds = [...new Set(eligibleEvents.map((e: any) => e.venue_id))];

  // Followers of the eligible venues, user-first (no token join).
  const { data: followerRows, error: followerErr } = await supabase
    .from("user_followed_venues")
    .select("user_id, venue_id")
    .in("venue_id", eligibleIds);

  if (followerErr) {
    console.error("[notify-events] follower fetch failed:", followerErr.message);
    return new Response(JSON.stringify({ error: followerErr.message }), { status: 500 });
  }

  if (!followerRows || followerRows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no followers for eligible venues" }));
  }

  const allFollowerIds = [...new Set((followerRows as any[]).map((r) => r.user_id))];
  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_venue_updates")
    .in("user_id", allFollowerIds);

  const followersByVenue = new Map<string, string[]>();
  for (const r of followerRows as any[]) {
    const list = followersByVenue.get(r.venue_id) ?? [];
    list.push(r.user_id);
    followersByVenue.set(r.venue_id, list);
  }

  let inserted = 0;
  let pushed = 0;
  for (const ev of eligibleEvents as any[]) {
    const recipients = categoryGatedRecipients(
      followersByVenue.get(ev.venue_id) ?? [],
      prefRows ?? [],
      "notifications_venue_updates",
    );
    if (recipients.length === 0) continue;

    const venueName = (ev.venue as any)?.name ?? null;
    const { title, body } = eventStartingCopy(ev.title, venueName, ev.starts_at);

    const result = await sendUserNotifications(supabase, recipients, {
      type: "event",
      title,
      body,
      data: { type: "event", venueId: ev.venue_id, eventId: ev.id },
    });
    inserted += result.inserted;
    pushed += result.pushed;
  }

  return new Response(JSON.stringify({ inserted, sent: pushed }), {
    headers: { "Content-Type": "application/json" },
  });
});
