"use client";

import { useState, useMemo } from "react";
import type { VenueWithWindows } from "@/lib/queries";
import type { Neighborhood } from "@/lib/neighborhoods";
import { VenueCardClient } from "./VenueCardClient";

type Props = {
  venues: VenueWithWindows[];
  neighborhoods: Neighborhood[];
  todayIndex: number;
  bestNeighborhoodSlugMap: Record<string, string>;
};

function isVenueInNeighborhood(
  venue: VenueWithWindows,
  n: Neighborhood
): boolean {
  if (venue.lat == null || venue.lng == null) return false;
  const latDelta = n.radiusMiles / 69;
  const lngDelta = n.radiusMiles / (69 * Math.cos((n.lat * Math.PI) / 180));
  return (
    venue.lat >= n.lat - latDelta &&
    venue.lat <= n.lat + latDelta &&
    venue.lng >= n.lng - lngDelta &&
    venue.lng <= n.lng + lngDelta
  );
}

export function FilterableVenueGrid({
  venues,
  neighborhoods,
  todayIndex,
  bestNeighborhoodSlugMap,
}: Props) {
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>("all");
  const [cuisineFilter, setCuisineFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [todayOnly, setTodayOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Extract unique cuisines and tags from venues
  const cuisines = useMemo(() => {
    const set = new Set<string>();
    for (const v of venues) {
      if (v.cuisine_type) set.add(v.cuisine_type);
    }
    return Array.from(set).sort();
  }, [venues]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const v of venues) {
      for (const t of v.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [venues]);

  // Apply filters
  const filtered = useMemo(() => {
    return venues.filter((v) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          v.name.toLowerCase().includes(q) ||
          v.address.toLowerCase().includes(q) ||
          (v.cuisine_type || "").toLowerCase().includes(q) ||
          v.tags.some((t) => t.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Neighborhood
      if (neighborhoodFilter !== "all") {
        const n = neighborhoods.find((n) => n.slug === neighborhoodFilter);
        if (n && !isVenueInNeighborhood(v, n)) return false;
      }

      // Cuisine
      if (cuisineFilter !== "all" && v.cuisine_type !== cuisineFilter) {
        return false;
      }

      // Tag
      if (tagFilter !== "all" && !v.tags.includes(tagFilter)) {
        return false;
      }

      // Today only
      if (todayOnly) {
        const hasToday = v.happy_hour_windows.some((w) =>
          w.dow.map(Number).includes(todayIndex)
        );
        if (!hasToday) return false;
      }

      return true;
    });
  }, [
    venues,
    searchQuery,
    neighborhoodFilter,
    cuisineFilter,
    tagFilter,
    todayOnly,
    neighborhoods,
    todayIndex,
  ]);

  const activeFilterCount = [
    neighborhoodFilter !== "all",
    cuisineFilter !== "all",
    tagFilter !== "all",
    todayOnly,
    searchQuery.length > 0,
  ].filter(Boolean).length;

  function formatLabel(s: string) {
    return s
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="sticky top-[65px] z-40 bg-white/80 backdrop-blur-md border-b border-border -mx-6 px-6 py-3 mb-6">
        {/* Search */}
        <div className="relative mb-3">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search venues, cuisines, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={neighborhoodFilter}
            onChange={(e) => setNeighborhoodFilter(e.target.value)}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="all">All Neighborhoods</option>
            {neighborhoods.map((n) => (
              <option key={n.slug} value={n.slug}>
                {n.name}
              </option>
            ))}
          </select>

          <select
            value={cuisineFilter}
            onChange={(e) => setCuisineFilter(e.target.value)}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="all">All Cuisines</option>
            {cuisines.map((c) => (
              <option key={c} value={c}>
                {formatLabel(c)}
              </option>
            ))}
          </select>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="all">All Tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {formatLabel(t)}
              </option>
            ))}
          </select>

          <button
            onClick={() => setTodayOnly(!todayOnly)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              todayOnly
                ? "bg-brand text-white"
                : "border border-border bg-white text-foreground hover:border-brand"
            }`}
          >
            Happy Hour Today
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setNeighborhoodFilter("all");
                setCuisineFilter("all");
                setTagFilter("all");
                setTodayOnly(false);
                setSearchQuery("");
              }}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground transition-colors"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted mb-4">
        {filtered.length} {filtered.length === 1 ? "venue" : "venues"}
        {activeFilterCount > 0 ? " matching your filters" : ""}
      </p>

      {/* Venue grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted text-sm">
            No venues match your filters. Try broadening your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {filtered.map((venue) => (
            <VenueCardClient
              key={venue.id}
              venue={venue}
              neighborhoodSlug={bestNeighborhoodSlugMap[venue.id] || "kansas-city"}
              todayIndex={todayIndex}
            />
          ))}
        </div>
      )}
    </div>
  );
}
