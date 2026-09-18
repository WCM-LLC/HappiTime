// supabase/functions/track-visit/index.ts
//
// Records an ANONYMOUS venue attribution event (QR scan, push click, organic
// open, social campaign open) into public.venue_attribution_events.
//
// Public endpoint: callable anonymously. All writes go through the service-role
// client here (the table has no direct anon insert policy), gated by a per
// (venue, session) rate limit so a single device cannot inflate a venue's counts.
//
// Request:  POST { venue_slug?: string, venue_id?: string,  // one is required
//                  source: 'qr'|'push_click'|'organic'|<social>,
//                  session_id?: string, lat?: number, lng?: number }
//   The web QR landing has the slug; the mobile app has the venue id. Either resolves.
// Response: 200 { ok: true } | 200 { ok: true, deduped: true } (rate-limited)
//           400 invalid body | 404 unknown venue | 500 server error
//
// `app_checkin` is NOT accepted here (removed 2026-09-14). A check-in is a
// verified, authenticated event and is written ONLY by verify-checkin, which
// also owns the public.checkins row and the venue_visits presence bridge.
// Accepting it on a public endpoint produced anonymous "check-ins" (guest taps
// before sign-in) and double-counted real ones. Root cause + data cleanup:
// docs/superpowers/specs/2026-09-14-anonymous-checkins-root-cause.md.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { buildVenueScanMessage } from "../_shared/scan-message.mjs";

// Provided by the Supabase Edge runtime; keeps background work alive after the
// response is sent. Declared for the type-checker.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

// Anonymous-only sources. `app_checkin` is deliberately absent — see header.
const VALID_SOURCES = new Set([
  "qr",
  "push_click",
  "organic",
  // Social campaign sources — set by the directory's trackEvent when a venue
  // page is opened with a matching utm_source/src param (see apps/directory/
  // src/lib/tracking.ts; DB CHECK extended in 20260611_attribution_social_sources).
  "tiktok",
  "instagram",
  "facebook",
  "social",
]);
// One attributed event per (venue, source, session) per 4 hours.
const RATE_LIMIT = 1;
const RATE_WINDOW_SECONDS = 4 * 60 * 60;

// ── Pure decision helpers (mirrored in test/track-visit.test.mjs — keep in sync) ──

/** Whether `source` is one of the four accepted attribution sources. */
function isValidSource(source: unknown): boolean {
  return typeof source === "string" && VALID_SOURCES.has(source);
}

/** Trims a string field to a non-empty value, or null. */
function cleanStr(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Rate-limit key for one (venue, source, session). Sessionless hits collapse to a
 * single per-venue+source key ("anon") so they cannot be used to inflate counts.
 */
function buildRateKey(venueId: string, source: string, sessionId: string | null): string {
  return `track-visit:${venueId}:${source}:${sessionId ?? "anon"}`;
}

/**
 * Given check_rate_limit's return value (TRUE = limit exceeded), decide whether to
 * record the event. We record only when NOT exceeded.
 */
function shouldRecord(rateLimitExceeded: boolean): boolean {
  return rateLimitExceeded !== true;
}

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

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Notify the venue's owners + managers that a visit was recorded. Runs in the
 * background (EdgeRuntime), so any failure here never affects the
 * track-visit response. Writes inbox rows first, then pushes:
 * notifications_venue_scans gates the row itself; notifications_push is
 * applied push-only inside sendUserNotifications (a missing
 * user_preferences row counts as opted-in for both).
 */
async function notifyVenueTeam(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  args: { venueId: string; orgId: string; venueName: string; source: string },
): Promise<void> {
  try {
    const { venueId, orgId, venueName, source } = args;

    const { data: members } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .in("role", ["owner", "manager"]);
    const memberIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))];
    if (memberIds.length === 0) return;

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("user_id, notifications_venue_scans")
      .in("user_id", memberIds);

    // notifications_venue_scans gates the row; notifications_push is applied
    // push-only inside sendUserNotifications.
    const recipients = categoryGatedRecipients(memberIds, prefs ?? [], "notifications_venue_scans");
    if (recipients.length === 0) return;

    const { title, body } = buildVenueScanMessage(source, venueName);
    await sendUserNotifications(supabase, recipients, {
      type: "venue",
      title,
      body,
      data: { type: "venue", venueId },
    });
  } catch (err) {
    console.error(
      "[track-visit] venue-team push failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "Server misconfigured" }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const venueSlug = cleanStr(body.venue_slug);
  const venueIdParam = cleanStr(body.venue_id);
  const source = typeof body.source === "string" ? body.source : "";
  const sessionId = cleanStr(body.session_id);
  const lat = toFiniteNumber(body.lat);
  const lng = toFiniteNumber(body.lng);

  if ((!venueSlug && !venueIdParam) || !isValidSource(source)) {
    return json(
      { ok: false, error: "venue_slug or venue_id, and a valid source, are required" },
      400,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve to a published venue by id (mobile) or slug (web QR landing).
  // Use limit(1) + data[0] rather than maybeSingle(): the floating supabase-js
  // build can surface PGRST116 ("multiple (or no) rows") from maybeSingle on an
  // empty result, which would turn a legitimate 404 into a 500.
  const venueQuery = supabase.from("venues").select("id, org_id, name").eq("status", "published").limit(1);
  const { data: venues, error: venueErr } = await (
    venueIdParam ? venueQuery.eq("id", venueIdParam) : venueQuery.eq("slug", venueSlug as string)
  );

  if (venueErr) return json({ ok: false, error: "Venue lookup failed" }, 500);
  const venue = (venues as Array<{ id: string; org_id: string; name: string }> | null)?.[0];
  if (!venue) return json({ ok: false, error: "Unknown venue" }, 404);

  const venueId = venue.id;

  // Resolve the authenticated caller, if any, so a signed-in app user's push /
  // organic open carries a user_id (best-effort; the web QR landing invokes with
  // the anon key and stays anonymous). verify_jwt=false means the platform
  // doesn't resolve the user for us — we do it here. This is attribution only:
  // nothing recorded here is a check-in, and no venue_visits row is written.
  let userId: string | null = null;
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (bearer && bearer !== anonKey) {
    try {
      const { data: userData } = await createClient(supabaseUrl, anonKey || serviceKey).auth.getUser(bearer);
      userId = userData.user?.id ?? null;
    } catch {
      // Not a resolvable user token — treat as anonymous.
    }
  }

  // check_rate_limit RETURNS TRUE WHEN THE LIMIT IS EXCEEDED (v_count > p_limit),
  // i.e. it reports "exceeded", not "allowed". With p_limit=1 the first call in the
  // window returns false (1 > 1) and is recorded; subsequent calls return true.
  const { data: exceeded, error: rateErr } = await supabase.rpc("check_rate_limit", {
    p_key: buildRateKey(venueId, source, sessionId),
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });

  if (rateErr) return json({ ok: false, error: "Rate limit check failed" }, 500);
  if (!shouldRecord(exceeded === true)) {
    // Already counted this device for this venue within the window — succeed quietly.
    return json({ ok: true, deduped: true });
  }

  const { error: insertErr } = await supabase.from("venue_attribution_events").insert({
    venue_id: venueId,
    source,
    user_id: userId,
    session_id: sessionId,
    lat,
    lng,
  });

  if (insertErr) return json({ ok: false, error: "Insert failed" }, 500);

  // Notify the venue's owners/managers in the background — never blocks the response.
  EdgeRuntime.waitUntil(
    notifyVenueTeam(supabase, {
      venueId,
      orgId: venue.org_id,
      venueName: venue.name,
      source,
    }),
  );

  return json({ ok: true });
});
