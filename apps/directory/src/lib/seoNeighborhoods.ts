import { getNeighborhood, type Neighborhood } from "./neighborhoods";

export type HappyHourLandingPage = {
  slug: string;
  neighborhoodSlug: string;
  h2: string;
  intro: string;
  metaDescription: string;
  canonicalPath: string;
};

export const HAPPY_HOUR_LANDING_PAGES: HappyHourLandingPage[] = [
  {
    slug: "westport-kansas-city",
    neighborhoodSlug: "westport",
    h2: "Happy Hour in Westport, Kansas City",
    intro:
      "Find happy hour in Westport, Kansas City, with live drink specials, food deals, and venue listings from HappiTime.",
    metaDescription:
      "Find happy hour in Westport, Kansas City. Browse live drink specials, food deals, and venues in one of KC's best nightlife districts.",
    canonicalPath: "/happy-hour/westport-kansas-city/",
  },
  {
    slug: "plaza-kansas-city",
    neighborhoodSlug: "plaza",
    h2: "Happy Hour on the Plaza, Kansas City",
    intro:
      "Find happy hour on the Plaza, Kansas City, with live drink specials, food deals, and venue listings from HappiTime.",
    metaDescription:
      "Find happy hour on the Plaza, Kansas City. Browse live drink specials, food deals, and venue listings around the Country Club Plaza.",
    canonicalPath: "/happy-hour/plaza-kansas-city/",
  },
  {
    slug: "crossroads-kansas-city",
    neighborhoodSlug: "crossroads",
    h2: "Happy Hour in the Crossroads Arts District",
    intro:
      "Find happy hour in the Crossroads Arts District with live Kansas City drink specials, food deals, and venue listings from HappiTime.",
    metaDescription:
      "Find happy hour in the Crossroads Arts District. Browse Kansas City drink specials, food deals, and live venue listings.",
    canonicalPath: "/happy-hour/crossroads-kansas-city/",
  },
  {
    slug: "power-light-kansas-city",
    neighborhoodSlug: "power-and-light",
    h2: "Happy Hour in the Power & Light District",
    intro:
      "Find happy hour in the Power & Light District with live Kansas City drink specials, food deals, and venue listings from HappiTime.",
    metaDescription:
      "Find happy hour in the Power & Light District. Browse Kansas City drink specials, food deals, and live venue listings.",
    canonicalPath: "/happy-hour/power-light-kansas-city/",
  },
  {
    slug: "downtown-kansas-city",
    neighborhoodSlug: "downtown",
    h2: "Happy Hour in Downtown Kansas City",
    intro:
      "Find happy hour in Downtown Kansas City with live drink specials, food deals, and venue listings from HappiTime.",
    metaDescription:
      "Find happy hour in Downtown Kansas City. Browse live drink specials, food deals, and venue listings for downtown KC bars and restaurants.",
    canonicalPath: "/happy-hour/downtown-kansas-city/",
  },
];

export function getHappyHourLandingPage(
  slug: string
): HappyHourLandingPage | undefined {
  return HAPPY_HOUR_LANDING_PAGES.find((page) => page.slug === slug);
}

export function getHappyHourLandingPageByNeighborhoodSlug(
  neighborhoodSlug: string
): HappyHourLandingPage | undefined {
  return HAPPY_HOUR_LANDING_PAGES.find(
    (page) => page.neighborhoodSlug === neighborhoodSlug
  );
}

export function getNeighborhoodForLandingPage(
  page: HappyHourLandingPage
): Neighborhood | undefined {
  return getNeighborhood(page.neighborhoodSlug);
}
