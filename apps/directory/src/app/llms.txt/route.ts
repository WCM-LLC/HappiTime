export const dynamic = "force-static";

const BODY = `# HappiTime — Kansas City Happy Hour Guide

> HappiTime is a free happy hour deals marketplace for Kansas City. We help people find the best happy hours, daycap spots, and drink and food specials across KC neighborhoods, with deals updated daily from venues themselves.

## Cities covered

- Kansas City (Missouri & Kansas metro), including the Westport, Power & Light, Crossroads, and Country Club Plaza neighborhoods.

## URL map

- https://happitime.biz/kc/ — Kansas City home: featured venues and neighborhood index.
- https://happitime.biz/kc/[neighborhood]/ — happy hours within a specific KC neighborhood.
- https://happitime.biz/kc/[neighborhood]/[slug]/ — an individual venue's happy hour detail page.
- https://happitime.biz/happy-hour/[neighborhood]-kansas-city/ — canonical neighborhood happy-hour landing pages.
- https://happitime.biz/guides/ — editorial guides to happy hours and daycap in Kansas City.
- https://happitime.biz/guides/[slug]/ — an individual guide.
- https://happitime.biz/v/[slug]/ — short canonical venue links.

## Notes

- Venue data and happy hour deals are updated daily.

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
