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

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Always write to directory_events (anonymous layer)
  const directoryPayload = {
    event_type: eventType,
    page_path: pagePath,
    venue_id: venueId ?? null,
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    user_agent:
      typeof navigator !== "undefined" ? navigator.userAgent || null : null,
    session_id: sid,
    user_id: user?.id ?? null,
    meta: meta ?? {},
  };

  await supabase.from("directory_events").insert(directoryPayload);

  // If signed in, also write to user_events for unified mobile + web reporting
  if (user?.id && eventType === "venue_click" && venueId) {
    await supabase.from("user_events").insert({
      user_id: user.id,
      event_type: "venue_view",
      venue_id: venueId,
    });
  }
}
