// supabase/functions/notify-upcoming-events/index.ts
//
// Sends Expo push notifications to users who have favorited venues where a
// published event starts within the next 60 minutes.
//
// Invoked hourly by pg_cron via invoke_notify_events() SECURITY DEFINER
// wrapper, which sends x-notify-token.  verify_jwt = false in config.toml.
// Uses starts_at timestamptz (absolute instant) — no TZ-string issue.
//
// 2026-09-14: recurring events. starts_at on an is_recurring row is the date
// the series was ENTERED, so a plain starts_at window never matched any of
// the ~109 published recurring series — they got zero pushes, ever. We now
// fetch recurring rows regardless of starts_at and expand recurrence_rule
// into the next occurrence (see _shared/recurrence.ts) before applying the
// 60-minute window.
//
// Also 2026-09-14: venue eligibility moved to _shared/push-gate.ts (open to
// all published venues by default; PUSH_GATE_MODE=paid re-gates).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { eventStartingCopy } from "../_shared/notification-copy.mjs";
import { nextOccurrence } from "../_shared/recurrence.ts";
import { eligibleVenueIds, pushGateMode } from "../_shared/push-gate.ts";

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

  // Window: events whose NEXT occurrence starts in the next 60 minutes.
  // One-offs: starts_at inside the window. Recurring: fetched regardless of
  // starts_at, then expanded and filtered below.
  const now = new Date();
  const lookahead = new Date(now.getTime() + 60 * 60_000);
  const nowIso = now.toISOString();
  const lookaheadIso = lookahead.toISOString();

  const { data: rawEvents, error: evErr } = await supabase
    .from("venue_events")
    .select(
      "id, venue_id, title, starts_at, is_recurring, recurrence_rule, timezone, venue:venues(name)",
    )
    .eq("status", "published")
    .or(`and(starts_at.gte.${nowIso},starts_at.lte.${lookaheadIso}),is_recurring.eq.true`);

  if (evErr) {
    console.error("[notify-events] events fetch failed:", evErr.message);
    return new Response(JSON.stringify({ error: evErr.message }), { status: 500 });
  }

  // Resolve each row to its next occurrence and keep only those in-window.
  // starts_at is overwritten with the resolved instant so downstream copy
  // ("Starts at 7:00 PM") reflects this week's occurrence, not the entry date.
  const events = (rawEvents ?? []).flatMap((e: any) => {
    const next = e.is_recurring
      ? nextOccurrence(e.starts_at, e.recurrence_rule, now, e.timezone ?? undefined)
      : new Date(e.starts_at);
    if (!next || next < now || next > lookahead) return [];
    return [{ ...e, starts_at: next.toISOString() }];
  });

  // One summary line per run so the hourly cron is observable in function logs.
  console.log(
    `[notify-events] scanned=${rawEvents?.length ?? 0} in_window=${events.length} ` +
      `recurring_in_window=${events.filter((e: any) => e.is_recurring).length} ` +
      `window=${nowIso}..${lookaheadIso}`,
  );

  if (events.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no upcoming events", scanned: rawEvents?.length ?? 0 }),
    );
  }

  const venueIds = [...new Set((events as any[]).map((e) => e.venue_id).filter(Boolean))];

  // Venue gate (published; plus a live paid plan when PUSH_GATE_MODE=paid).
  const eligible = await eligibleVenueIds(supabase, venueIds);
  const eligibleEvents = (events as any[]).filter((e) => eligible.has(e.venue_id));

  if (eligibleEvents.length === 0) {
    console.log(
      `[notify-events] ${events.length} event(s) in window, 0 eligible under PUSH_GATE_MODE=${pushGateMode()} — nothing sent`,
    );
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
