/**
 * Kansas City neighborhood definitions for the SEO directory.
 * Each entry defines a URL slug, display name, and geographic center
 * used for proximity-based venue queries.
 */

export type Neighborhood = {
  slug: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  /** Approximate search radius in miles */
  radiusMiles: number;
};

export const KC_NEIGHBORHOODS: Neighborhood[] = [
  {
    slug: "18th-and-vine",
    name: "18th & Vine",
    description:
      "The historic heart of Kansas City's jazz and cultural legacy. Home to the Jazz District, soul food staples, and happy hours steeped in history.",
    lat: 39.0912,
    lng: -94.5627,
    radiusMiles: 0.5,
  },
  {
    slug: "westport",
    name: "Westport",
    description:
      "Kansas City's original entertainment district — packed with bars, live music, and some of the city's best happy hour deals.",
    lat: 39.0561,
    lng: -94.5929,
    radiusMiles: 0.5,
  },
  {
    slug: "power-and-light",
    name: "Power & Light District",
    description:
      "Downtown KC's premier nightlife hub. Two blocks of restaurants, rooftop bars, and daily happy hour specials.",
    lat: 39.0989,
    lng: -94.5836,
    radiusMiles: 0.3,
  },
  {
    slug: "crossroads",
    name: "Crossroads Arts District",
    description:
      "Where craft cocktails meet local art. The Crossroads is home to KC's most creative bar scene and inventive happy hour menus.",
    lat: 39.0847,
    lng: -94.5866,
    radiusMiles: 0.5,
  },
  {
    slug: "plaza",
    name: "Country Club Plaza",
    description:
      "Upscale dining and classic cocktail bars on the iconic Plaza. Expect polished happy hours with a view.",
    lat: 39.0425,
    lng: -94.5927,
    radiusMiles: 0.5,
  },
  {
    slug: "downtown",
    name: "Downtown KC",
    description:
      "The central business district with historic steakhouses, craft cocktail bars, and post-work happy hour culture at its finest.",
    lat: 39.0997,
    lng: -94.5786,
    radiusMiles: 0.5,
  },
  {
    slug: "midtown",
    name: "Midtown",
    description:
      "The connector between Westport and Downtown — home to 39th Street's eclectic mix of BBQ joints, patios, and neighborhood bars.",
    lat: 39.0569,
    lng: -94.5875,
    radiusMiles: 0.6,
  },
  {
    slug: "river-market",
    name: "River Market",
    description:
      "Historic market district with waterfront patios, breweries, and laid-back happy hours near the Missouri River.",
    lat: 39.1087,
    lng: -94.5847,
    radiusMiles: 0.4,
  },
  {
    slug: "troost",
    name: "Troost & Prospect",
    description:
      "A revitalizing corridor rich in community spirit, with soul food, local bars, and neighborhood spots serving up great drink specials.",
    lat: 39.0530,
    lng: -94.5690,
    radiusMiles: 0.8,
  },
  {
    slug: "brookside",
    name: "Brookside",
    description:
      "A walkable neighborhood strip with cozy neighborhood bars and family-friendly restaurants running weekday specials.",
    lat: 39.0167,
    lng: -94.5927,
    radiusMiles: 0.4,
  },
  {
    slug: "waldo",
    name: "Waldo",
    description:
      "South KC's favorite hangout strip — dive bars, taco joints, and happy hours that locals swear by.",
    lat: 38.9917,
    lng: -94.5927,
    radiusMiles: 0.5,
  },
  {
    slug: "west-bottoms",
    name: "West Bottoms",
    description:
      "KC's gritty-chic warehouse district. Speakeasies, dive bars, and First Friday energy make this a happy hour adventure.",
    lat: 39.1031,
    lng: -94.5975,
    radiusMiles: 0.4,
  },
  {
    slug: "north-kansas-city",
    name: "North Kansas City",
    description:
      "A growing craft brewery scene north of the river, with taprooms and gastropubs offering generous pour specials.",
    lat: 39.1308,
    lng: -94.5686,
    radiusMiles: 1.0,
  },
  {
    slug: "northeast",
    name: "Northeast KC",
    description:
      "One of the city's most diverse neighborhoods — taquerias, international markets, and hidden-gem bars with unbeatable prices.",
    lat: 39.1100,
    lng: -94.5500,
    radiusMiles: 0.8,
  },
  {
    slug: "kck",
    name: "Kansas City, Kansas",
    description:
      "Across the state line with legendary BBQ, tacos, and dive bars. KCK happy hours are some of the metro's best-kept secrets.",
    lat: 39.1133,
    lng: -94.6268,
    radiusMiles: 1.5,
  },
  {
    slug: "overland-park",
    name: "Overland Park",
    description:
      "Johnson County's dining hub — from upscale cocktail bars to Tex-Mex joints, with generous suburban happy hour pours.",
    lat: 38.9108,
    lng: -94.6558,
    radiusMiles: 2.0,
  },
  {
    slug: "lees-summit",
    name: "Lee's Summit",
    description:
      "An eastern suburb with a charming downtown square, local breweries, and family-friendly happy hour spots.",
    lat: 38.9108,
    lng: -94.3822,
    radiusMiles: 2.0,
  },
  {
    slug: "grandview",
    name: "Grandview",
    description:
      "A tight-knit south KC suburb with neighborhood grills, soul food, and laid-back happy hour vibes.",
    lat: 38.8850,
    lng: -94.5330,
    radiusMiles: 1.5,
  },
];

export function getNeighborhood(slug: string): Neighborhood | undefined {
  return KC_NEIGHBORHOODS.find((n) => n.slug === slug);
}
