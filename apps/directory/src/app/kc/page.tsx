import type { Metadata } from "next";
import { KC_NEIGHBORHOODS, type Neighborhood } from "@/lib/neighborhoods";
import {
  HAPPY_HOUR_LANDING_PAGES,
  getHappyHourLandingPageByNeighborhoodSlug,
  getNeighborhoodForLandingPage,
} from "@/lib/seoNeighborhoods";
import { getAllKCVenues } from "@/lib/queries";
import type { VenueWithWindows } from "@/lib/queries";
import { KCMapPage } from "@/components/KCMapPage";

// Revalidate every 15 minutes — keeps venue data fresh
export const revalidate = 900;

const KC_SEO_TITLE = "Happy Hours in Kansas City | HappiTime";
const KC_SEO_DESCRIPTION =
  "Find the best happy hour deals in Kansas City. Browse drink specials and food deals by neighborhood — Westport, Plaza, Crossroads & more. Download HappiTime free.";
const HAPPITIME_BUSINESS_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "HappiTime",
    url: "https://happitime.biz",
    logo: "https://happitime.biz/icon.png",
    description:
      "HappiTime is Kansas City's happy hour app — browse drink specials, food deals, and menus from local bars and restaurants by neighborhood.",
    sameAs: [
      "https://www.instagram.com/findhappitime",
      "https://apps.apple.com/us/app/happitime/id6757933269",
      "https://play.google.com/store/apps/happitime",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Support",
      email: "admin@happitime.biz",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "HappiTime",
    description:
      "Kansas City's only purpose-built happy hour app. Find drink specials and food deals near you in Westport, Plaza, Crossroads, Power & Light, and more.",
    url: "https://happitime.biz",
    telephone: "",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Kansas City",
      addressRegion: "MO",
      addressCountry: "US",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: "39.0997",
      longitude: "-94.5786",
    },
    areaServed: {
      "@type": "City",
      name: "Kansas City",
    },
    priceRange: "Free",
    openingHours: "Mo-Su 00:00-23:59",
    sameAs: ["https://www.instagram.com/findhappitime"],
  },
];

export const metadata: Metadata = {
  title: {
    absolute: KC_SEO_TITLE,
  },
  description: KC_SEO_DESCRIPTION,
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
  openGraph: {
    type: "website",
    title: KC_SEO_TITLE,
    description: KC_SEO_DESCRIPTION,
    url: "https://happitime.biz/kc/",
  },
  twitter: {
    card: "summary_large_image",
    title: KC_SEO_TITLE,
    description: KC_SEO_DESCRIPTION,
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
      url: `https://happitime.biz${
        getHappyHourLandingPageByNeighborhoodSlug(n.slug)?.canonicalPath ??
        `/kc/${n.slug}/`
      }`,
    })),
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: KC_SEO_TITLE,
    url: "https://happitime.biz/kc/",
    description: KC_SEO_DESCRIPTION,
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
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(HAPPITIME_BUSINESS_JSON_LD).replace(
            /</g,
            "\\u003c"
          ),
        }}
      />
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
      <NeighborhoodSeoLinks />
    </>
  );
}

function NeighborhoodSeoLinks() {
  return (
    <section
      aria-label="Kansas City happy hour neighborhoods"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HAPPY_HOUR_LANDING_PAGES.map((page) => {
            const neighborhood = getNeighborhoodForLandingPage(page);

            return (
              <a
                key={page.slug}
                href={page.canonicalPath}
                className="group block rounded-2xl border border-border bg-surface p-5 transition-all hover:border-brand hover:shadow-sm"
              >
                <h2 className="text-lg font-bold text-foreground transition-colors group-hover:text-brand">
                  {page.h2}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">
                  {neighborhood?.description ?? page.intro}
                </p>
                <span className="mt-4 inline-flex text-xs font-semibold text-brand">
                  View happy hours →
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
