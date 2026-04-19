import type { Metadata } from "next";
import { KC_NEIGHBORHOODS, type Neighborhood } from "@/lib/neighborhoods";
import { getAllKCVenues } from "@/lib/queries";
import type { VenueWithWindows } from "@/lib/queries";

// Revalidate every 15 minutes — keeps venue data fresh
export const revalidate = 900;

export const metadata: Metadata = {
  title: "Happy Hours in Kansas City",
  description:
    "Browse happy hour deals across every Kansas City neighborhood — Westport, Power & Light, Crossroads, Plaza, and more. Updated daily.",
};

/**
 * Check if a venue falls within a neighborhood's geographic radius.
 * Uses the same lat/lng bounding-box logic as the Supabase queries.
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
 * Returns the neighborhood slug, or "kansas-city" as fallback.
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

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Happy Hours in <span className="text-brand">Kansas City</span>
      </h1>
      <p className="text-muted text-lg mb-10">
        {venues.length} venues with active happy hour specials across{" "}
        {KC_NEIGHBORHOODS.length} neighborhoods.
      </p>

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

      {/* All venues list for SEO crawlability */}
      <section>
        <h2 className="text-2xl font-bold text-foreground mb-6">All Venues</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {venues.map((venue) => (
            <a
              key={venue.id}
              href={`/kc/${bestNeighborhoodSlug(venue)}/${venue.slug}/`}
              className="flex items-start gap-4 rounded-xl border border-border bg-surface p-4 hover:border-brand hover:shadow-sm transition-all"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm truncate">
                  {venue.name}
                </h3>
                <p className="text-xs text-muted truncate">{venue.address}</p>
                <p className="text-xs text-brand font-medium mt-1">
                  {venue.happy_hour_windows.length}{" "}
                  {venue.happy_hour_windows.length === 1 ? "happy hour" : "happy hours"}
                </p>
              </div>
              {venue.rating != null && (
                <span className="text-xs font-semibold text-brand whitespace-nowrap">
                  ★ {Number(venue.rating).toFixed(1)}
                </span>
              )}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
