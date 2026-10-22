"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/tracking";

/**
 * Drop this component into any page to automatically track a page_view event.
 * Runs once on mount. Pass venueId on venue pages so the view is attributable
 * per venue (and social-tagged visits reach venue_attribution_events).
 *
 * `meta` rides along in directory_events.meta. Guide pages pass
 * { guide_id, author_id } and the referral landing passes { referrer_handle },
 * which is what super_user_metrics() reads to count guide views and QR scans.
 */
export function PageTracker({
  pagePath,
  venueId,
  meta,
}: {
  pagePath: string;
  venueId?: string;
  meta?: Record<string, unknown>;
}) {
  // Serialize so a fresh object literal per render doesn't re-fire the effect.
  const metaKey = meta ? JSON.stringify(meta) : "";
  useEffect(() => {
    trackEvent({
      eventType: "page_view",
      pagePath,
      venueId,
      meta: metaKey ? (JSON.parse(metaKey) as Record<string, unknown>) : undefined,
    });
  }, [pagePath, venueId, metaKey]);

  return null;
}
