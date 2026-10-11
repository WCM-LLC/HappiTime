"use client";

import { supabase } from "./supabase";

/**
 * Session ID for anonymous tracking. Kept in sessionStorage so it survives
 * full-page navigations within a tab, the same lifetime as the first-touch
 * attribution below; track-visit dedupes on (venue, source, session), so a
 * per-page-load ID would count one visitor's revisits as new visits. Falls
 * back to a per-load in-memory ID when storage is unavailable.
 */
const SESSION_STORAGE_KEY = "ht_session_id";
let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
  } catch {
    sessionId ??= crypto.randomUUID();
  }
  return sessionId;
}

type TrackEventParams = {
  eventType: "page_view" | "venue_click" | "cta_click";
  pagePath: string;
  venueId?: string;
  meta?: Record<string, unknown>;
};

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "src"];
const UTM_STORAGE_KEY = "ht_first_touch_utm";

/**
 * Infer a traffic source from document.referrer when no UTM params are
 * present (e.g. link-in-bio tools or in-app browsers that drop params).
 */
function inferSourceFromReferrer(): string | null {
  if (typeof document === "undefined" || !document.referrer) return null;
  try {
    const host = new URL(document.referrer).hostname;
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    if (host === "instagram.com" || host.endsWith(".instagram.com"))
      return "instagram";
    if (host === "facebook.com" || host.endsWith(".facebook.com"))
      return "facebook";
    return null;
  } catch {
    return null;
  }
}

/**
 * Campaign attribution for an event, in priority order:
 *
 * 1. Campaign params (utm_* or src) on the current URL, length-capped; absent
 *    params are omitted.
 * 2. The session's first touch (meta.utm_touch = "carried"), so venue pages
 *    reached by browsing from /kc/ stay attributed.
 * 3. A tiktok/instagram/facebook referrer (meta.utm_touch = "referrer"), for
 *    link-in-bio tools and in-app browsers that drop params.
 *
 * First touch is stored in sessionStorage the first time a session lands with
 * utm_source/src or a social referrer. A later campaign landing doesn't
 * replace it, except that explicit params may upgrade a referrer guess.
 * Storage is best-effort: without it, 1 and 3 still apply per page.
 */
function getUtmMeta(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) out[k] = v.slice(0, 64);
  }

  let stored: Record<string, string> | null = null;
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    // Storage unavailable or unparseable: attribute this page on its own.
  }
  const remember = (meta: Record<string, string>) => {
    try {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(meta));
    } catch {
      // Best-effort; this event still carries its own attribution.
    }
  };

  if (Object.keys(out).length > 0) {
    if ((out.utm_source || out.src) && (!stored || stored.utm_touch === "referrer")) {
      remember(out);
    }
    return out;
  }
  if (stored) return { ...stored, utm_touch: "carried" };
  const inferred = inferSourceFromReferrer();
  if (inferred) {
    const meta = { utm_source: inferred, utm_touch: "referrer" };
    remember(meta);
    return meta;
  }
  return out;
}

/**
 * Record the session's first touch without sending an event. Mounted in the
 * root layout so landings on pages without a PageTracker (guides, /app/) are
 * captured before a plain link drops the query string and the referrer.
 */
export function captureFirstTouch(): void {
  getUtmMeta();
}

/**
 * Social sources that should also be recorded as venue attribution events
 * (powers the venue-facing dashboard via venue_attribution_events).
 * Must stay in sync with VALID_SOURCES in supabase/functions/track-visit.
 */
const ATTRIBUTED_SOCIAL_SOURCES = new Set(["tiktok", "instagram", "facebook", "social"]);

/**
 * Track an anonymous event in the directory_events table.
 * If the user is signed in, also writes to user_events for unified reporting.
 */
export async function trackEvent({
  eventType,
  pagePath,
  venueId,
  meta,
}: TrackEventParams): Promise<void> {
  const sid = getSessionId();
  const utm = getUtmMeta();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Always write to directory_events (anonymous layer).
  // UTM params ride along in meta so traffic sources are queryable
  // (meta->>'utm_source', meta->>'utm_campaign').
  const directoryPayload = {
    event_type: eventType,
    page_path: pagePath,
    venue_id: venueId ?? null,
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    user_agent:
      typeof navigator !== "undefined" ? navigator.userAgent || null : null,
    session_id: sid,
    user_id: user?.id ?? null,
    meta: { ...utm, ...(meta ?? {}) },
  };

  await supabase.from("directory_events").insert(directoryPayload);

  // Social-tagged venue page views also become venue attribution events, so
  // venue dashboards show "HappiTime sent these people" alongside QR scans.
  // track-visit dedupes per (venue, source, session) server-side.
  const socialSource = (utm.utm_source ?? utm.src ?? "").toLowerCase();
  if (
    eventType === "page_view" &&
    venueId &&
    ATTRIBUTED_SOCIAL_SOURCES.has(socialSource)
  ) {
    void supabase.functions
      .invoke("track-visit", {
        body: { venue_id: venueId, source: socialSource, session_id: sid },
      })
      .catch(() => {
        /* attribution is best-effort; never break the page */
      });
  }

  // If signed in, also write to user_events for unified mobile + web reporting
  if (user?.id && eventType === "venue_click" && venueId) {
    await supabase.from("user_events").insert({
      user_id: user.id,
      event_type: "venue_view",
      venue_id: venueId,
    });
  }
}
