"use client";

import { trackEvent } from "@/lib/tracking";

type TrackedLinkProps = {
  href: string;
  eventType: "venue_click" | "cta_click";
  pagePath: string;
  venueId?: string;
  meta?: Record<string, unknown>;
  className?: string;
  children: React.ReactNode;
};

/**
 * An anchor tag that fires a tracking event before navigating.
 */
export function TrackedLink({
  href,
  eventType,
  pagePath,
  venueId,
  meta,
  className,
  children,
}: TrackedLinkProps) {
  const handleClick = () => {
    // Fire and forget — don't block navigation
    trackEvent({ eventType, pagePath, venueId, meta });
  };

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
