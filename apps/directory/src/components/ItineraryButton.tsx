"use client";

import { useItinerary } from "./ItineraryContext";

type Props = {
  venueId: string;
  venueName: string;
  venueSlug: string;
  neighborhoodSlug: string;
  size?: "sm" | "md";
};

export function ItineraryButton({
  venueId,
  venueName,
  venueSlug,
  neighborhoodSlug,
  size = "sm",
}: Props) {
  const { add, remove, has } = useItinerary();
  const inList = has(venueId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inList) {
      remove(venueId);
    } else {
      add({ venueId, venueName, venueSlug, neighborhoodSlug });
    }
  };

  const sizeClasses =
    size === "md"
      ? "px-4 py-2 text-sm gap-2"
      : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center rounded-full font-semibold transition-all ${sizeClasses} ${
        inList
          ? "bg-brand text-white hover:bg-brand-dark"
          : "bg-brand-subtle text-brand-text hover:bg-brand hover:text-white"
      }`}
      title={inList ? "Remove from itinerary" : "Add to itinerary"}
    >
      {inList ? (
        <>
          <svg
            className={size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          Added
        </>
      ) : (
        <>
          <svg
            className={size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Add to Itinerary
        </>
      )}
    </button>
  );
}
