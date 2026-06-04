import type { MetadataRoute } from "next";
import { KC_NEIGHBORHOODS } from "@/lib/neighborhoods";
import { HAPPY_HOUR_LANDING_PAGES } from "@/lib/seoNeighborhoods";
import { getAllKCVenues } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

const STATIC_GUIDE_SLUGS = new Set([
  "best-happy-hours-kansas-city",
  "westport-happy-hour-guide",
  "power-and-light-happy-hour-guide",
  "best-happy-hour-food-kansas-city",
  "friday-happy-hours-kansas-city",
]);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://happitime.biz";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/kc/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/terms/`,
      lastModified: new Date("2026-04-20"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/privacy/`,
      lastModified: new Date("2026-04-20"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/claim/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/app/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contactus/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/guides/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/guides/best-happy-hours-kansas-city/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/guides/westport-happy-hour-guide/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/guides/power-and-light-happy-hour-guide/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/guides/best-happy-hour-food-kansas-city/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/guides/friday-happy-hours-kansas-city/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  // Canonical happy-hour neighborhood landing pages.
  // The legacy `/kc/[neighborhood]/` URLs 301 to these (see next.config.ts),
  // so only the canonical `/happy-hour/[slug]/` form is listed in the sitemap.
  const happyHourLandingPages: MetadataRoute.Sitemap =
    HAPPY_HOUR_LANDING_PAGES.map((page) => ({
      url: `${baseUrl}${page.canonicalPath}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.85,
    }));

  // Dynamic guide pages (Super User authored)
  let dynamicGuidePages: MetadataRoute.Sitemap = [];
  try {
    const { data: guides } = await supabase
      .from("guides")
      .select("slug, updated_at")
      .eq("status", "published");
    dynamicGuidePages = (guides ?? [])
      .filter((g) => !STATIC_GUIDE_SLUGS.has(g.slug))
      .map((g) => ({
        url: `${baseUrl}/guides/${g.slug}/`,
        lastModified: g.updated_at ? new Date(g.updated_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
  } catch {
    // If DB is unavailable, skip dynamic guide pages
  }

  // Venue detail pages
  let venuePages: MetadataRoute.Sitemap = [];
  try {
    const venues = await getAllKCVenues();
    venuePages = venues.map((venue) => {
      // Find best neighborhood for URL
      let bestSlug = "kansas-city";
      let bestDist = Infinity;
      for (const n of KC_NEIGHBORHOODS) {
        if (venue.lat == null || venue.lng == null) continue;
        const dlat = venue.lat - n.lat;
        const dlng = venue.lng - n.lng;
        const dist = dlat * dlat + dlng * dlng;
        const latDelta = n.radiusMiles / 69;
        const lngDelta =
          n.radiusMiles / (69 * Math.cos((n.lat * Math.PI) / 180));
        if (
          dist < bestDist &&
          Math.abs(dlat) <= latDelta &&
          Math.abs(dlng) <= lngDelta
        ) {
          bestDist = dist;
          bestSlug = n.slug;
        }
      }
      return {
        url: `${baseUrl}/kc/${bestSlug}/${venue.slug}/`,
        lastModified: new Date(),
        changeFrequency: "daily" as const,
        priority: 0.7,
      };
    });
  } catch {
    // If DB is unavailable, skip venue pages
  }

  return [
    ...staticPages,
    ...dynamicGuidePages,
    ...happyHourLandingPages,
    ...venuePages,
  ];
}
