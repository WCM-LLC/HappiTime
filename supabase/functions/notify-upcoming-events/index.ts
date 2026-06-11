// supabase/functions/notify-upcoming-events/index.ts
//
// Sends Expo push notifications to users who have favorited venues where a
// published event starts within the next 60 minutes.
//
// Invoked hourly by pg_cron via invoke_notify_events() SECURITY DEFINER
// wrapper, which sends x-notify-token.  verify_jwt = false in config.toml.
// Uses starts_at timestamptz (absolute instant) — no TZ-string issue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendExpoPush, type ExpoPushMessage } from "../_shared/expo-push.ts";

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

  // Resolve recipients: users who follow these venues with push + venue_updates prefs
  const { data: tokenRows, error: tokenErr } = await supabase
    .from("user_followed_venues")
    .select(`
      user_id,
      venue_id,
      token:user_push_tokens!inner(expo_push_token),
      prefs:user_preferences!inner(notifications_push, notifications_venue_updates)
    `)
    .in("venue_id", eligibleIds);

  if (tokenErr) {
    console.error("[notify-events] token fetch failed:", tokenErr.message);
    return new Response(JSON.stringify({ error: tokenErr.message }), { status: 500 });
  }

  if (!tokenRows || tokenRows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no tokens for followed venues" }));
  }

  // Build venue → events[] multimap (multiple events per venue in window is valid)
  const venueEventsMap = new Map<string, any[]>();
  for (const ev of eligibleEvents) {
    const list = venueEventsMap.get(ev.venue_id) ?? [];
    list.push(ev);
    venueEventsMap.set(ev.venue_id, list);
  }

  // Build one message per (recipient, event)
  const messages: ExpoPushMessage[] = [];

  for (const row of tokenRows as any[]) {
    const token = row.token?.expo_push_token;
    if (!token || !token.startsWith("ExponentPushToken")) continue;

    // Skip if user disabled push or venue-update notifications
    if (row.prefs?.notifications_push === false) continue;
    if (row.prefs?.notifications_venue_updates === false) continue;

    const venueEventList = venueEventsMap.get(row.venue_id);
    if (!venueEventList) continue;

    for (const ev of venueEventList) {
      const venueName = (ev.venue as any)?.name ?? "a saved venue";

      messages.push({
        to: token,
        title: `Starting soon at ${venueName}`,
        body: `${ev.title} starts soon`,
        sound: "default",
        data: { type: "event", venueId: row.venue_id, eventId: ev.id },
      });
    }
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no valid tokens" }));
  }

  const totalSent = await sendExpoPush(messages);

  return new Response(JSON.stringify({ sent: totalSent }), {
    headers: { "Content-Type": "application/json" },
  });
});
