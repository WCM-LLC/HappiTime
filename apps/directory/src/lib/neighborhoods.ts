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
    slug: "river-market",
    name: "River Market",
    description:
      "Historic market district with waterfront patios, breweries, and laid-back happy hours near the Missouri River.",
    lat: 39.1087,
    lng: -94.5847,
    radiusMiles: 0.4,
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
    slug: "north-kansas-city",
    name: "North Kansas City",
    description:
      "A growing craft brewery scene north of the river, with taprooms and gastropubs offering generous pour specials.",
    lat: 39.1308,
    lng: -94.5686,
    radiusMiles: 1.0,
  },
];

export function getNeighborhood(slug: string): Neighborhood | undefined {
  return KC_NEIGHBORHOODS.find((n) => n.slug === slug);
}
