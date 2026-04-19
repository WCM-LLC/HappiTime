"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/tracking";

/**
 * Drop this component into any page to automatically track a page_view event.
 * Runs once on mount.
 */
export function PageTracker({ pagePath }: { pagePath: string }) {
  useEffect(() => {
    trackEvent({ eventType: "page_view", pagePath });
  }, [pagePath]);

  return null;
}
