// supabase/functions/notify-upcoming-happy-hours/index.ts
//
// Sends Expo push notifications to users who have saved venues with happy
// hours starting within the next 60 minutes.
//
// Invoked hourly by pg_cron via invoke_notify_happy_hours() SECURITY DEFINER
// wrapper, which sends x-notify-token.  verify_jwt = false in config.toml.
// Time comparisons are computed in America/Chicago (DST-safe).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { happyHourStartingCopy } from "../_shared/notification-copy.mjs";

const LOOKAHEAD_MINUTES = 60;

Deno.serve(async (req) => {
  // Allow manual triggers via POST; scheduled invocations also POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  // Token gate: cron sends x-notify-token; manual callers must do the same
  const provided = req.headers.get("x-notify-token") ?? "";
  const { data: expected, error: tokErr } = await supabase.rpc("get_notify_job_token");
  if (tokErr) return new Response(JSON.stringify({ error: `token lookup failed: ${tokErr.message}` }), { status: 500 });
  if (!expected || provided !== expected) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  // Current time in HH:MM format for time-window comparison — America/Chicago (DST-safe)
  const now = new Date();
  const ctFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const nowParts = ctFmt.formatToParts(now);
  const getP = (type: string) => nowParts.find((p) => p.type === type)?.value ?? "";
  const currentTime = `${getP("hour")}:${getP("minute")}`;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const todayDow = weekdayMap[getP("weekday")] ?? 0; // 0=Sun … 6=Sat

  const lookaheadDate = new Date(now.getTime() + LOOKAHEAD_MINUTES * 60_000);
  const laParts = ctFmt.formatToParts(lookaheadDate);
  const getLa = (type: string) => laParts.find((p) => p.type === type)?.value ?? "";
  const lookaheadStr = `${getLa("hour")}:${getLa("minute")}`;

  // Find published windows starting in the next LOOKAHEAD_MINUTES
  const { data: windows, error: winErr } = await supabase
    .from("happy_hour_windows")
    .select("id, venue_id, start_time, label, venue:venues(name)")
    .eq("status", "published")
    .gte("start_time", currentTime)
    .lte("start_time", lookaheadStr)
    .contains("dow", [todayDow]);

  if (winErr) {
    console.error("[notify] window fetch failed:", winErr.message);
    return new Response(JSON.stringify({ error: winErr.message }), { status: 500 });
  }

  if (!windows || windows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no upcoming windows" }));
  }

  const venueIds = [...new Set(windows.map((w: any) => w.venue_id).filter(Boolean))];

  const { data: eligibleSubs } = await supabase
    .from("venue_subscriptions")
    .select("venue_id, plan, status")
    .in("plan", ["featured", "founding_pilot"])
    .neq("status", "inactive")
    .in("venue_id", venueIds);

  const eligibleVenueIds = new Set((eligibleSubs ?? []).map((r: any) => r.venue_id));
  const eligibleWindows = (windows as any[]).filter((w) => eligibleVenueIds.has(w.venue_id));

  if (eligibleWindows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no push-eligible venues in lookahead window" }));
  }


  // Followers of the eligible venues, user-first (no token join).
  const eligibleIds = [...new Set(eligibleWindows.map((w: any) => w.venue_id))];
  const { data: followerRows, error: followerErr } = await supabase
    .from("user_followed_venues")
    .select("user_id, venue_id")
    .in("venue_id", eligibleIds);

  if (followerErr) {
    console.error("[notify] follower fetch failed:", followerErr.message);
    return new Response(JSON.stringify({ error: followerErr.message }), { status: 500 });
  }

  if (!followerRows || followerRows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no followers for eligible venues" }));
  }

  const allFollowerIds = [...new Set((followerRows as any[]).map((r) => r.user_id))];
  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_happy_hours")
    .in("user_id", allFollowerIds);

  // Group followers per venue, then send one notification per eligible window.
  const followersByVenue = new Map<string, string[]>();
  for (const r of followerRows as any[]) {
    const list = followersByVenue.get(r.venue_id) ?? [];
    list.push(r.user_id);
    followersByVenue.set(r.venue_id, list);
  }

  let inserted = 0;
  let pushed = 0;
  for (const window of eligibleWindows as any[]) {
    const recipients = categoryGatedRecipients(
      followersByVenue.get(window.venue_id) ?? [],
      prefRows ?? [],
      "notifications_happy_hours",
    );
    if (recipients.length === 0) continue;

    const venueName = (window.venue as any)?.name ?? null;
    const { title, body } = happyHourStartingCopy(
      venueName,
      window.start_time.slice(0, 5),
      window.label ?? null,
    );

    const result = await sendUserNotifications(supabase, recipients, {
      type: "happy_hour",
      title,
      body,
      data: { type: "happy_hour", venueId: window.venue_id, windowId: window.id },
    });
    inserted += result.inserted;
    pushed += result.pushed;
  }

  return new Response(JSON.stringify({ inserted, sent: pushed }), {
    headers: { "Content-Type": "application/json" },
  });
});
