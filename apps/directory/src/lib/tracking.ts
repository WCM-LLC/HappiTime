"use client";

import { supabase } from "./supabase";

/**
 * Generate or retrieve a session ID for anonymous tracking.
 * Uses a simple random ID stored in memory (no localStorage in SSR).
 */
let sessionId: string | null = null;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

type TrackEventParams = {
  eventType: "page_view" | "venue_click" | "cta_click";
  pagePath: string;
  venueId?: string;
  meta?: Record<string, unknown>;
};

/**
 * Capture campaign params (utm_* or src) from the current URL so every event
 * carries its traffic source in meta. Values are length-capped; absent params
 * are omitted.
 */
function getUtmMeta(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "src"]) {
    const v = params.get(k);
    if (v) out[k] = v.slice(0, 64);
  }
  return out;
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
