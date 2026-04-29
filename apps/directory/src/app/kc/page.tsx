import type { Metadata } from "next";
import { KC_NEIGHBORHOODS, type Neighborhood } from "@/lib/neighborhoods";
import { getAllKCVenues } from "@/lib/queries";
import type { VenueWithWindows } from "@/lib/queries";
import { KCMapPage } from "@/components/KCMapPage";

// Revalidate every 15 minutes — keeps venue data fresh
export const revalidate = 900;

export const metadata: Metadata = {
  title: "Happy Hours in Kansas City — Best Deals by Neighborhood (2026)",
  description:
    "Daily updated happy hours in Kansas City — find the best drink specials, food deals, and bar discounts across Westport, Power & Light, Crossroads, Plaza, 18th & Vine, Brookside, and more KC neighborhoods.",
  keywords: [
    "Kansas City happy hour",
    "KC happy hour deals",
    "best happy hours Kansas City",
    "Kansas City drink specials",
    "Kansas City food deals",
    "Westport happy hour",
    "Power and Light happy hour",
    "Crossroads happy hour",
    "Plaza happy hour",
    "KC bar deals 2026",
  ],
  alternates: {
    canonical: "/kc/",
  },
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

  const bestNeighborhoodSlugMap: Record<string, string> = {};
  for (const v of venues) {
    bestNeighborhoodSlugMap[v.id] = bestNeighborhoodSlug(v);
  }

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Kansas City Happy Hour Neighborhoods",
    description:
      "Browse happy hour deals across Kansas City neighborhoods — daily updated drink specials and food deals.",
    numberOfItems: KC_NEIGHBORHOODS.length,
    itemListElement: KC_NEIGHBORHOODS.map((n, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: n.name,
      url: `https://happitime.biz/kc/${n.slug}/`,
    })),
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Happy Hours in Kansas City — Best Deals by Neighborhood (2026)",
    url: "https://happitime.biz/kc/",
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "HappiTime",
          item: "https://happitime.biz/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Kansas City",
          item: "https://happitime.biz/kc/",
        },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <KCMapPage
        venues={venues}
        neighborhoods={KC_NEIGHBORHOODS}
        bestNeighborhoodSlugMap={bestNeighborhoodSlugMap}
      />
    </>
  );
}
