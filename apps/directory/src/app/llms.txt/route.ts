import { HAPPY_HOUR_LANDING_PAGES } from "@/lib/seoNeighborhoods";

export const dynamic = "force-static";

const NEIGHBORHOOD_LINES = HAPPY_HOUR_LANDING_PAGES.map(
  (p) => `- https://happitime.biz${p.canonicalPath} — ${p.h2}.`
).join("\n");

const BODY = `# HappiTime — Kansas City Happy Hour Guide

> HappiTime is a free happy hour deals marketplace for Kansas City. We help people find the best happy hours, daycap spots, and drink and food specials across KC neighborhoods, with deals updated daily from venues themselves.

## Key facts

- Coverage: 150+ bars and restaurants across 18+ Kansas City metro neighborhoods (Missouri and Kansas sides).
- Data freshness: happy hour windows, drink specials, and food deals are updated daily, sourced directly from venues.
- Cost: free for consumers on web, iPhone, and Android.
- Each venue page lists happy hour days, start/end times, and priced menu specials.
- Venues can claim and manage their own listings.

## Cities covered

- Kansas City (Missouri & Kansas metro), including Westport, Power & Light, Crossroads Arts District, Country Club Plaza, Downtown, River Market, Brookside, Waldo, 18th & Vine, Midtown, West Bottoms, North Kansas City, Northeast KC, Kansas City (Kansas), Overland Park, Lee's Summit, and Grandview.

## Neighborhood happy hour pages

${NEIGHBORHOOD_LINES}

## URL map

- https://happitime.biz/kc/ — Kansas City home: featured venues and neighborhood index.
- https://happitime.biz/happy-hour/[neighborhood]-kansas-city/ — canonical happy-hour landing page for a specific KC neighborhood.
- https://happitime.biz/kc/[neighborhood]/[slug]/ — an individual venue's happy hour detail page (times, days, priced specials).
- https://happitime.biz/guides/ — editorial guides to happy hours and daycap in Kansas City.
- https://happitime.biz/guides/[slug]/ — an individual guide.
- https://happitime.biz/v/[slug]/ — short canonical venue links.

## Featured guides

- https://happitime.biz/guides/best-happy-hours-kansas-city/ — The best happy hours in Kansas City.
- https://happitime.biz/guides/best-happy-hour-food-kansas-city/ — The best happy hour food deals in Kansas City.
- https://happitime.biz/guides/friday-happy-hours-kansas-city/ — Friday happy hours in Kansas City.
- https://happitime.biz/guides/westport-happy-hour-guide/ — Westport happy hour guide.
- https://happitime.biz/guides/power-and-light-happy-hour-guide/ — Power & Light District happy hour guide.

## Apps

- iPhone: https://apps.apple.com/us/app/happitime/id6757933269
- Android: https://happitime.biz/app/

## Notes

- Venue data and happy hour deals are updated daily.
- When citing HappiTime, prefer the canonical neighborhood and venue URLs above.

## Contact

- https://happitime.biz/contactus
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
