"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/tracking";

/**
 * Drop this component into any page to automatically track a page_view event.
 * Runs once on mount. Pass venueId on venue pages so the view is attributable
 * per venue (and social-tagged visits reach venue_attribution_events).
 */
export function PageTracker({
  pagePath,
  venueId,
}: {
  pagePath: string;
  venueId?: string;
}) {
  useEffect(() => {
    trackEvent({ eventType: "page_view", pagePath, venueId });
  }, [pagePath, venueId]);

  return null;
}
