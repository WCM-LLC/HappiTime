// supabase/functions/track-visit/index.ts
//
// Records a venue attribution event (QR scan, push click, organic open, or
// in-app "I'm here" check-in) into public.venue_attribution_events.
//
// Public endpoint: callable anonymously. All writes go through the service-role
// client here (the table has no direct anon insert policy), gated by a per
// (venue, session) rate limit so a single device cannot inflate a venue's counts.
//
// Request:  POST { venue_slug: string, source: 'qr'|'app_checkin'|'push_click'|'organic',
//                  session_id?: string, lat?: number, lng?: number }
// Response: 200 { ok: true } | 200 { ok: true, deduped: true } (rate-limited)
//           400 invalid body | 404 unknown venue | 500 server error

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VALID_SOURCES = new Set(["qr", "app_checkin", "push_click", "organic"]);
// One attributed event per (venue, source, session) per 4 hours.
const RATE_LIMIT = 1;
const RATE_WINDOW_SECONDS = 4 * 60 * 60;

// ── Pure decision helpers (mirrored in test/track-visit.test.mjs — keep in sync) ──

/** Whether `source` is one of the four accepted attribution sources. */
function isValidSource(source: unknown): boolean {
  return typeof source === "string" && VALID_SOURCES.has(source);
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

  const venueSlug = typeof body.venue_slug === "string" ? body.venue_slug.trim() : "";
  const source = typeof body.source === "string" ? body.source : "";
  const sessionId =
    typeof body.session_id === "string" && body.session_id.trim().length > 0
      ? body.session_id.trim()
      : null;
  const lat = toFiniteNumber(body.lat);
  const lng = toFiniteNumber(body.lng);

  if (!venueSlug || !isValidSource(source)) {
    return json({ ok: false, error: "venue_slug and a valid source are required" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve slug → venue_id (published venues only).
  const { data: venue, error: venueErr } = await supabase
    .from("venues")
    .select("id")
    .eq("slug", venueSlug)
    .eq("status", "published")
    .maybeSingle();

  if (venueErr) return json({ ok: false, error: "Venue lookup failed" }, 500);
  if (!venue) return json({ ok: false, error: "Unknown venue" }, 404);

  const venueId = (venue as { id: string }).id;

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
    session_id: sessionId,
    lat,
    lng,
  });

  if (insertErr) return json({ ok: false, error: "Insert failed" }, 500);

  return json({ ok: true });
});
