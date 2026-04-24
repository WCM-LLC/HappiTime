import type { Metadata } from "next";
import { KC_NEIGHBORHOODS, type Neighborhood } from "@/lib/neighborhoods";
import { getAllKCVenues } from "@/lib/queries";
import type { VenueWithWindows } from "@/lib/queries";
import { FilterableVenueGrid } from "@/components/FilterableVenueGrid";

// Revalidate every 15 minutes — keeps venue data fresh
export const revalidate = 900;

export const metadata: Metadata = {
  title: "Happy Hours in Kansas City",
  description:
    "Browse happy hour deals across every Kansas City neighborhood — Westport, Power & Light, Crossroads, 18th & Vine, Plaza, and more. Updated daily.",
};

/**
 * Check if a venue falls within a neighborhood's geographic radius.
 */
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

/**
 * Find the best-matching neighborhood for a venue (closest center).
 */
function bestNeighborhoodSlug(venue: VenueWithWindows): string {
  if (venue.lat == null || venue.lng == null) return "kansas-city";
  let best = "kansas-city";
  let bestDist = Infinity;
  for (const n of KC_NEIGHBORHOODS) {
    const dlat = venue.lat - n.lat;
    const dlng = venue.lng - n.lng;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < bestDist && isVenueInNeighborhood(venue, n)) {
      bestDist = dist;
      best = n.slug;
    }
  }
  return best;
}

export default async function KCPage() {
  const venues = await getAllKCVenues();
  const todayIndex = new Date().getDay();

  // Pre-compute neighborhood slug map for each venue
  const bestNeighborhoodSlugMap: Record<string, string> = {};
  for (const v of venues) {
    bestNeighborhoodSlugMap[v.id] = bestNeighborhoodSlug(v);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Happy Hours in <span className="text-brand">Kansas City</span>
      </h1>
      <p className="text-muted text-lg mb-10">
        {venues.length} venues with active happy hour specials across{" "}
        {KC_NEIGHBORHOODS.length} neighborhoods.
      </p>

      {/* Neighborhood grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
        {KC_NEIGHBORHOODS.map((n) => {
          const count = venues.filter((v) =>
            isVenueInNeighborhood(v, n)
          ).length;

          return (
            <a
              key={n.slug}
              href={`/kc/${n.slug}/`}
              className="group block rounded-2xl border border-border bg-surface p-6 hover:border-brand hover:shadow-md transition-all"
            >
              <h2 className="text-lg font-bold text-foreground group-hover:text-brand transition-colors mb-1">
                {n.name}
              </h2>
              <p className="text-xs text-muted-light font-medium mb-2">
                {count} {count === 1 ? "venue" : "venues"}
              </p>
              <p className="text-sm text-muted leading-relaxed line-clamp-2">
                {n.description}
              </p>
            </a>
          );
        })}
      </div>

      {/* All venues — filterable + itinerary-enabled */}
      <section>
        <h2 className="text-2xl font-bold text-foreground mb-6">All Venues</h2>
        <FilterableVenueGrid
          venues={venues}
          neighborhoods={KC_NEIGHBORHOODS}
          todayIndex={todayIndex}
          bestNeighborhoodSlugMap={bestNeighborhoodSlugMap}
        />
      </section>
    </div>
  );
}
