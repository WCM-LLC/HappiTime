"use client";

import { useItinerary } from "./ItineraryContext";

/**
 * Small floating badge shown in the header linking to the itinerary page.
 * Only renders when there are items in the itinerary.
 */
export function ItineraryBadge() {
  const { count } = useItinerary();

  if (count === 0) return null;

  return (
    <a
      href="/kc/itinerary/"
      className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-white text-xs font-semibold hover:bg-brand-dark transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
      My Itinerary ({count})
    </a>
  );
}
