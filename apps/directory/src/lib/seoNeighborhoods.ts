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
  {
    slug: "18th-and-vine-kansas-city",
    neighborhoodSlug: "18th-and-vine",
    h2: "Happy Hour in 18th & Vine, Kansas City",
    intro:
      "Find happy hour in 18th & Vine — Kansas City's historic jazz district with soul food staples and drink specials steeped in culture and history.",
    metaDescription:
      "Find happy hour in 18th & Vine, Kansas City. Browse drink specials, food deals, and venues in KC's historic Jazz District.",
    canonicalPath: "/happy-hour/18th-and-vine-kansas-city/",
  },
  {
    slug: "midtown-kansas-city",
    neighborhoodSlug: "midtown",
    h2: "Happy Hour in Midtown Kansas City",
    intro:
      "Find happy hour in Midtown Kansas City — 39th Street's eclectic mix of BBQ joints, patios, and neighborhood bars between Westport and Downtown.",
    metaDescription:
      "Find happy hour in Midtown Kansas City. Browse drink specials, food deals, and bar listings along 39th Street and the Midtown corridor.",
    canonicalPath: "/happy-hour/midtown-kansas-city/",
  },
  {
    slug: "river-market-kansas-city",
    neighborhoodSlug: "river-market",
    h2: "Happy Hour in the River Market, Kansas City",
    intro:
      "Find happy hour in the River Market — waterfront patios, breweries, and laid-back drink specials near the Missouri River.",
    metaDescription:
      "Find happy hour in the River Market, Kansas City. Browse drink specials, food deals, and brewery listings in KC's historic waterfront district.",
    canonicalPath: "/happy-hour/river-market-kansas-city/",
  },
  {
    slug: "troost-kansas-city",
    neighborhoodSlug: "troost",
    h2: "Happy Hour on Troost & Prospect, Kansas City",
    intro:
      "Find happy hour on Troost & Prospect — soul food, local bars, and neighborhood spots with great drink specials along a revitalizing KC corridor.",
    metaDescription:
      "Find happy hour on Troost & Prospect, Kansas City. Browse drink specials, food deals, and local bar listings along this vibrant KC corridor.",
    canonicalPath: "/happy-hour/troost-kansas-city/",
  },
  {
    slug: "brookside-kansas-city",
    neighborhoodSlug: "brookside",
    h2: "Happy Hour in Brookside, Kansas City",
    intro:
      "Find happy hour in Brookside — cozy neighborhood bars and family-friendly restaurants running weekday specials on a walkable strip.",
    metaDescription:
      "Find happy hour in Brookside, Kansas City. Browse drink specials, food deals, and bar listings in KC's walkable south-side neighborhood.",
    canonicalPath: "/happy-hour/brookside-kansas-city/",
  },
  {
    slug: "waldo-kansas-city",
    neighborhoodSlug: "waldo",
    h2: "Happy Hour in Waldo, Kansas City",
    intro:
      "Find happy hour in Waldo — South KC's favorite strip of dive bars, taco joints, and locals-only happy hour deals.",
    metaDescription:
      "Find happy hour in Waldo, Kansas City. Browse drink specials, food deals, and bar listings on South KC's favorite neighborhood strip.",
    canonicalPath: "/happy-hour/waldo-kansas-city/",
  },
  {
    slug: "west-bottoms-kansas-city",
    neighborhoodSlug: "west-bottoms",
    h2: "Happy Hour in the West Bottoms, Kansas City",
    intro:
      "Find happy hour in the West Bottoms — speakeasies, dive bars, and warehouse-district energy in KC's gritty-chic nightlife scene.",
    metaDescription:
      "Find happy hour in the West Bottoms, Kansas City. Browse drink specials, food deals, and bar listings in KC's warehouse and speakeasy district.",
    canonicalPath: "/happy-hour/west-bottoms-kansas-city/",
  },
  {
    slug: "north-kansas-city",
    neighborhoodSlug: "north-kansas-city",
    h2: "Happy Hour in North Kansas City",
    intro:
      "Find happy hour in North Kansas City — taprooms, gastropubs, and a growing craft brewery scene north of the river with generous pour specials.",
    metaDescription:
      "Find happy hour in North Kansas City. Browse drink specials, food deals, and craft brewery listings just north of the Missouri River.",
    canonicalPath: "/happy-hour/north-kansas-city/",
  },
  {
    slug: "northeast-kansas-city",
    neighborhoodSlug: "northeast",
    h2: "Happy Hour in Northeast Kansas City",
    intro:
      "Find happy hour in Northeast Kansas City — taquerias, international markets, and hidden-gem bars with some of the metro's most unbeatable prices.",
    metaDescription:
      "Find happy hour in Northeast Kansas City. Browse drink specials, food deals, and diverse bar listings in KC's most international neighborhood.",
    canonicalPath: "/happy-hour/northeast-kansas-city/",
  },
  {
    slug: "kansas-city-kansas",
    neighborhoodSlug: "kck",
    h2: "Happy Hour in Kansas City, Kansas",
    intro:
      "Find happy hour in Kansas City, Kansas — legendary BBQ, tacos, and dive bars across the state line with some of the metro's best-kept drink specials.",
    metaDescription:
      "Find happy hour in Kansas City, Kansas. Browse drink specials, food deals, and bar listings across the state line in KCK.",
    canonicalPath: "/happy-hour/kansas-city-kansas/",
  },
  {
    slug: "overland-park-kansas",
    neighborhoodSlug: "overland-park",
    h2: "Happy Hour in Overland Park, KS",
    intro:
      "Find happy hour in Overland Park — from upscale cocktail bars to Tex-Mex joints, Johnson County's dining hub offers generous suburban pour specials.",
    metaDescription:
      "Find happy hour in Overland Park, KS. Browse drink specials, food deals, and bar listings in Johnson County's premier dining destination.",
    canonicalPath: "/happy-hour/overland-park-kansas/",
  },
  {
    slug: "lees-summit-missouri",
    neighborhoodSlug: "lees-summit",
    h2: "Happy Hour in Lee's Summit, MO",
    intro:
      "Find happy hour in Lee's Summit — a charming downtown square, local breweries, and family-friendly happy hour spots in KC's eastern suburbs.",
    metaDescription:
      "Find happy hour in Lee's Summit, MO. Browse drink specials, food deals, and local brewery listings in KC's eastern suburbs.",
    canonicalPath: "/happy-hour/lees-summit-missouri/",
  },
  {
    slug: "grandview-missouri",
    neighborhoodSlug: "grandview",
    h2: "Happy Hour in Grandview, MO",
    intro:
      "Find happy hour in Grandview — neighborhood grills, soul food, and laid-back happy hour vibes in a tight-knit south KC suburb.",
    metaDescription:
      "Find happy hour in Grandview, MO. Browse drink specials, food deals, and neighborhood bar listings south of Kansas City.",
    canonicalPath: "/happy-hour/grandview-missouri/",
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
