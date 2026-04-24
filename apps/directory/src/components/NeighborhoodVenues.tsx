"use client";

import { useState } from "react";
import type { VenueWithWindows } from "@/lib/queries";
import { VenueCard } from "./VenueCard";

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  venues: VenueWithWindows[];
  neighborhoodSlug: string;
  neighborhoodName: string;
  todayIndex: number;
};

export function NeighborhoodVenues({
  venues,
  neighborhoodSlug,
  neighborhoodName,
  todayIndex,
}: Props) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Filter venues: if a day is selected, only show venues with a window on that day
  const dayFiltered =
    selectedDay !== null
      ? venues.filter((v) =>
          v.happy_hour_windows.some((w) =>
            w.dow.map(Number).includes(selectedDay)
          )
        )
      : venues;

  // Sort promoted venues to the top, then by name
  const filteredVenues = [...dayFiltered].sort((a, b) => {
    const aPrio = a.promotion_priority ?? 0;
    const bPrio = b.promotion_priority ?? 0;
    if (aPrio !== bPrio) return bPrio - aPrio;
    return a.name.localeCompare(b.name);
  });

  // The active day for highlighting — selected day, or today if nothing selected
  const activeDay = selectedDay ?? todayIndex;

  return (
    <>
      {/* Day filter chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {DOW_NAMES.map((day, i) => {
          const isActive = i === activeDay;
          const isSelected = selectedDay === i;
          const venueCount = venues.filter((v) =>
            v.happy_hour_windows.some((w) => w.dow.map(Number).includes(i))
          ).length;

          return (
            <button
              key={day}
              onClick={() => setSelectedDay(isSelected ? null : i)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                isActive
                  ? "bg-brand text-white border-brand shadow-sm"
                  : "bg-surface text-muted border-border hover:border-brand/50 hover:text-foreground"
              }`}
            >
              {day}
              {i === todayIndex && selectedDay === null && " (Today)"}
              {isSelected && i === todayIndex && " (Today)"}
              {isSelected && i !== todayIndex && ""}
              <span className="ml-1 opacity-70">({venueCount})</span>
            </button>
          );
        })}
      </div>

      {/* Active filter label */}
      {selectedDay !== null && (
        <div className="flex items-center gap-2 mb-6">
          <p className="text-sm text-muted">
            Showing {filteredVenues.length}{" "}
            {filteredVenues.length === 1 ? "venue" : "venues"} with happy hours
            on <span className="font-semibold text-foreground">{DOW_NAMES[selectedDay]}s</span>
          </p>
          <button
            onClick={() => setSelectedDay(null)}
            className="text-xs text-brand font-medium hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {filteredVenues.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted text-lg mb-2">
            {selectedDay !== null
              ? `No happy hours on ${DOW_NAMES[selectedDay]}s in ${neighborhoodName}.`
              : `No happy hours listed in ${neighborhoodName} yet.`}
          </p>
          <p className="text-sm text-muted-light">
            {selectedDay !== null ? (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-brand font-medium hover:underline"
              >
                Show all days
              </button>
            ) : (
              <>
                Know a spot?{" "}
                <a
                  href="https://apps.apple.com"
                  className="text-brand font-medium"
                >
                  Add it in the app
                </a>
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {filteredVenues.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              neighborhoodSlug={neighborhoodSlug}
              todayIndex={activeDay}
            />
          ))}
        </div>
      )}
    </>
  );
}
