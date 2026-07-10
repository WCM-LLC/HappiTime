// supabase/functions/verify-checkin/index.ts
//
// Authenticated POST endpoint: records a pilot check-in for a venue.
//
// Request body: { venue_id: string, code: string, lat: number, lng: number, fallback?: boolean }
// Caller MUST supply a valid user JWT in the Authorization header.
//
// Rule order (fail-closed, cheapest first):
//   1. Rate limit     — 5 attempts / 15 min / (user, venue)
//   2. Employee check — org member of venue's org cannot check in
//   3. Code match     — generateCheckinCode (skip when fallback===true)
//   4. Geofence       — haversine(caller, venue) ≤ venue.geofence_radius_m
//   5. Network cap    — ≤3 check-ins this service_date across all venues
//   5b. Fallback cap  — ≤2 lifetime gps_fallback per (user, venue)
//   5c. Abuse velocity— impossible-geography → venue_flags(abuse_suspected)
//   6. Insert         — checkins row + venue_attribution_events row
//   7. Return         — { stamps, stamps_to_next_round, is_first_visit }
//
// GPS fallback (fallback === true):
//   - Skips rule 3 (code check)
//   - Enforces ≤2 lifetime gps_fallback check-ins per (user, venue)
//   - Writes method='gps_fallback' + venue_flags(staff_code_unknown)
//
// Reference: mirrors track-visit for client setup, CORS, rate-limit pattern.
//            mirrors send-friend-invite for auth resolution.
//
// Pure decision helpers live in logic.ts (importable without starting a server).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serviceDate } from "../_shared/checkin-code.ts";
import {
  haversineMeters,
  withinGeofence,
  codeMatchesWithGrace,
  stampsToNextRound,
  isFirstVisit,
  attemptsRemaining,
  canRedeem,
  canRedeemWeekly,
  REDEEM_COOLDOWN_MS,
  CHECKIN_RATE_LIMIT,
  FALLBACK_LIFETIME_LIMIT,
  STAMPS_PER_ROUND,
} from "./logic.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Constants (handler-local)
// ─────────────────────────────────────────────────────────────────────────────
const CHECKIN_RATE_WINDOW_SECONDS = 15 * 60; // 15 minutes
const NETWORK_CAP_PER_DAY = 3;
// Impossible-geography: check-in from >50 km away within 5 minutes → flag
const ABUSE_TIME_WINDOW_MS = 5 * 60 * 1000;
const ABUSE_DISTANCE_THRESHOLD_M = 50_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── 0. Env + client setup ────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 500);

  // ── 0a. Authenticate caller (mirrors send-friend-invite pattern) ─────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, jwt, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const userId = user.id;

  // ── 0b. Parse body ───────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const venueId = typeof body.venue_id === "string" ? body.venue_id.trim() : "";
  const submittedCode =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const lat =
    typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const lng =
    typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;
  const fallback = body.fallback === true;
  const redeem = body.redeem === true;

  if (!venueId) return json({ error: "venue_id is required" }, 400);
  if (!fallback && !submittedCode) return json({ error: "code is required" }, 400);
  if (lat === null || lng === null) return json({ error: "lat and lng are required" }, 400);

  // All DB writes use service-role (bypasses RLS), same as track-visit.
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const todayServiceDate = serviceDate(now);

  // ── 0c. Fetch venue (checkin_secret, geofence_radius_m, lat/lng, org_id) ─
  const { data: venueRows, error: venueErr } = await supabase
    .from("venues")
    .select("id, org_id, lat, lng, checkin_secret, geofence_radius_m, reward_preset")
    .eq("id", venueId)
    .eq("status", "published")
    .limit(1);

  if (venueErr) return json({ error: "Venue lookup failed" }, 500);
  const venue = (
    venueRows as Array<{
      id: string;
      org_id: string;
      lat: number | null;
      lng: number | null;
      checkin_secret: string;
      geofence_radius_m: number;
      reward_preset: string | null;
    }> | null
  )?.[0];
  if (!venue) return json({ error: "Unknown venue" }, 404);

  // ── Rule 1: Rate limit ───────────────────────────────────────────────────
  const rateKey = `checkin:${userId}:${venueId}`;
  const { data: rateExceeded, error: rateErr } = await supabase.rpc("check_rate_limit", {
    p_key: rateKey,
    p_limit: CHECKIN_RATE_LIMIT,
    p_window_seconds: CHECKIN_RATE_WINDOW_SECONDS,
  });
  if (rateErr) return json({ error: "Rate limit check failed" }, 500);
  if (rateExceeded === true) {
    return json({ error: "rate_limited" }, 429);
  }

  // Fetch current attempt count to compute attempts_remaining for bad_code responses.
  // check_rate_limit already incremented the count for this request; read it back.
  const { data: rateRow } = await supabase
    .from("api_rate_limits")
    .select("count")
    .eq("key", rateKey)
    .maybeSingle();
  const currentAttemptCount =
    (rateRow as { count?: number } | null)?.count ?? 1;

  // ── Rule 2: Employee check ───────────────────────────────────────────────
  const { data: memberRow } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", venue.org_id)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (memberRow) return json({ error: "employee_excluded" }, 400);

  // ── Rule 3: Code match (skipped for fallback) ────────────────────────────
  if (!fallback) {
    if (!codeMatchesWithGrace(venue.checkin_secret, now, submittedCode)) {
      return json(
        {
          error: "bad_code",
          attempts_remaining: attemptsRemaining(
            CHECKIN_RATE_LIMIT,
            currentAttemptCount,
          ),
        },
        400,
      );
    }
  }

  // ── Redeem path (after code validation, before check-in insert) ──────────
  // When redeem===true: validate stamps ≥ 5, insert round_redemptions, return
  // reset stamps. This is NOT a check-in — it bypasses Rules 4-6 entirely.
  if (redeem) {
    // Query current stamps (same derivation as Rule 7 below)
    const { data: lastRedemptionForRedeem } = await supabase
      .from("round_redemptions")
      .select("created_at")
      .eq("user_id", userId)
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastRedeemedAt =
      (lastRedemptionForRedeem as { created_at?: string } | null)?.created_at ?? null;

    // Weekly cap (enforced in data): one redemption per (user, venue) per 7 days.
    const lastRedeemedAtMs = lastRedeemedAt ? new Date(lastRedeemedAt).getTime() : null;
    if (!canRedeemWeekly(lastRedeemedAtMs, now.getTime())) {
      const nextEligible = new Date(lastRedeemedAtMs! + REDEEM_COOLDOWN_MS).toISOString();
      return json(
        { error: "weekly_limit_reached", next_eligible_at: nextEligible },
        400,
      );
    }

    const sinceForRedeem = lastRedeemedAt ?? "1970-01-01T00:00:00Z";

    const { count: currentStamps, error: redeemStampsErr } = await supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("venue_id", venueId)
      .gte("created_at", sinceForRedeem);

    if (redeemStampsErr) {
      console.error("[verify-checkin] redeem stamps query failed:", redeemStampsErr.message);
      return json({ error: "Stamps query failed" }, 500);
    }

    const stampsForRedeem = currentStamps ?? 0;

    if (!canRedeem(stampsForRedeem)) {
      return json(
        { error: "insufficient_stamps", stamps: stampsForRedeem },
        400,
      );
    }

    // Insert the redemption row
    const { error: redeemInsertErr } = await supabase
      .from("round_redemptions")
      .insert({
        user_id: userId,
        venue_id: venueId,
        checkins_consumed: STAMPS_PER_ROUND,
        confirmed_with_code: true,
      });

    if (redeemInsertErr) {
      console.error("[verify-checkin] round_redemptions insert failed:", redeemInsertErr.message);
      return json({ error: "Redemption failed" }, 500);
    }

    // After redemption the stamp counter resets to 0 (new redemption row is the new anchor)
    return json({
      stamps: 0,
      stamps_to_next_round: stampsToNextRound(0),
      is_first_visit: false,
      redeemed: true,
      reward_preset: venue.reward_preset ?? null,
    });
  }

  // ── Rule 4: Geofence ─────────────────────────────────────────────────────
  if (venue.lat !== null && venue.lng !== null) {
    const dist = haversineMeters(lat, lng, venue.lat, venue.lng);
    if (!withinGeofence(dist, venue.geofence_radius_m)) {
      return json({ error: "out_of_range" }, 400);
    }
  }
  // If venue has no coordinates, skip geofence (graceful degradation).

  // ── Rule 5: Network cap (≤3 check-ins this service_date) ─────────────────
  const { count: todayCount, error: capErr } = await supabase
    .from("checkins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("service_date", todayServiceDate);
  if (capErr) return json({ error: "Cap check failed" }, 500);
  if ((todayCount ?? 0) >= NETWORK_CAP_PER_DAY) {
    return json({ error: "network_cap" }, 400);
  }

  // ── Rule 5b: GPS fallback lifetime limit ─────────────────────────────────
  if (fallback) {
    const { count: fallbackCount, error: fallbackErr } = await supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("venue_id", venueId)
      .eq("method", "gps_fallback");
    if (fallbackErr) return json({ error: "Fallback check failed" }, 500);
    if ((fallbackCount ?? 0) >= FALLBACK_LIFETIME_LIMIT) {
      // Write staff_code_unknown flag before rejecting.
      await supabase.from("venue_flags").insert({
        venue_id: venueId,
        flag_type: "staff_code_unknown",
        meta: { user_id: userId, reason: "fallback_limit_exceeded" },
      });
      return json({ error: "fallback_limit" }, 400);
    }
  }

  // ── Rule 5c: Abuse velocity check (best-effort) ───────────────────────────
  // If user checked in from an impossible distance within ABUSE_TIME_WINDOW_MS → flag.
  {
    const abuseWindowStart = new Date(now.getTime() - ABUSE_TIME_WINDOW_MS).toISOString();
    const { data: recentCheckins } = await supabase
      .from("checkins")
      .select("lat, lng")
      .eq("user_id", userId)
      .gte("created_at", abuseWindowStart)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .limit(5);

    if (recentCheckins && recentCheckins.length > 0) {
      for (const c of recentCheckins as Array<{ lat: number; lng: number }>) {
        const d = haversineMeters(lat, lng, c.lat, c.lng);
        if (d > ABUSE_DISTANCE_THRESHOLD_M) {
          await supabase.from("venue_flags").insert({
            venue_id: venueId,
            flag_type: "abuse_suspected",
            meta: {
              user_id: userId,
              distance_m: Math.round(d),
              window_ms: ABUSE_TIME_WINDOW_MS,
            },
          });
          return json({ error: "abuse_suspected" }, 400);
        }
      }
    }
  }

  // ── Rule 6: Birth-certificate check (BEFORE writes) ─────────────────────
  const [{ data: priorAttrRows }, { count: priorCheckinCount }] = await Promise.all([
    supabase
      .from("venue_attribution_events")
      .select("id")
      .eq("user_id", userId)
      .eq("venue_id", venueId)
      .limit(1),
    supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("venue_id", venueId),
  ]);

  const hadPriorAttribution =
    Array.isArray(priorAttrRows) && priorAttrRows.length > 0;
  const hadPriorCheckin = (priorCheckinCount ?? 0) > 0;
  const firstVisit = isFirstVisit(hadPriorAttribution, hadPriorCheckin);

  // ── Rule 6: Insert checkin row ────────────────────────────────────────────
  const method = fallback ? "gps_fallback" : "code";
  const { error: checkinErr } = await supabase.from("checkins").insert({
    user_id: userId,
    venue_id: venueId,
    method,
    service_date: todayServiceDate,
    lat,
    lng,
  });

  // 23505 = unique_violation: (user, venue, service_date) already exists → dedup → success.
  // Any other Postgres error is a real failure.
  if (checkinErr && (checkinErr as { code?: string }).code !== "23505") {
    console.error("[verify-checkin] checkin insert failed:", checkinErr.message);
    return json({ error: "Insert failed" }, 500);
  }
  const wasDuped = checkinErr !== null; // was a 23505

  // Insert attribution row with source='app_checkin' (matches track-visit columns).
  // Non-critical: attribution failure does not fail the check-in.
  if (!wasDuped) {
    const { error: attrErr } = await supabase.from("venue_attribution_events").insert({
      venue_id: venueId,
      source: "app_checkin",
      user_id: userId,
      lat,
      lng,
    });
    if (attrErr) {
      console.error("[verify-checkin] attribution insert failed:", attrErr.message);
    }

    // Fallback: also write staff_code_unknown flag (informational, not a rejection).
    if (fallback) {
      const { error: flagErr } = await supabase.from("venue_flags").insert({
        venue_id: venueId,
        flag_type: "staff_code_unknown",
        meta: { user_id: userId, service_date: todayServiceDate },
      });
      if (flagErr) {
        console.error("[verify-checkin] fallback flag insert failed:", flagErr.message);
      }
    }
  }

  // ── Rule 7: Compute stamps AFTER insert (dedup case: stamps unchanged) ────
  // stamps = count of checkins for (user, venue) with created_at > last redemption (or epoch)
  const { data: lastRedemption } = await supabase
    .from("round_redemptions")
    .select("created_at")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sinceTs =
    (lastRedemption as { created_at?: string } | null)?.created_at ??
    "1970-01-01T00:00:00Z";

  const { count: stampsCount, error: stampsErr } = await supabase
    .from("checkins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .gte("created_at", sinceTs);

  if (stampsErr) {
    console.error("[verify-checkin] stamps query failed:", stampsErr.message);
    return json({ error: "Stamps query failed" }, 500);
  }

  const stamps = stampsCount ?? 1;

  return json({
    stamps,
    stamps_to_next_round: stampsToNextRound(stamps),
    is_first_visit: firstVisit,
    reward_preset: venue.reward_preset ?? null,
  });
});
