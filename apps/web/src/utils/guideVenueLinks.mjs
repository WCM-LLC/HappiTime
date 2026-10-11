// Venue slugs a guide body links to, in order of first appearance.
//
// MUST stay in step with public.guide_venue_slugs() in
// supabase/migrations/20261011041500_guide_itineraries.sql — that SQL function is
// what actually builds the guide's companion itinerary. This copy only powers the
// live "N venues linked" hint in the editor; test/guide-itineraries.test.mjs
// asserts the two patterns are the same.
//
// Matches markdown links and bare URLs to a venue page:
//   https://happitime.biz/kc/<area>/<slug>[/]   /kc/<area>/<slug>   /v/<slug>
// Neighborhood pages (/kc/<area>/) have no slug segment and do not match.

export const GUIDE_VENUE_LINK_PATTERN =
  "(?:happitime\\.biz|\\]\\(\\s*)/(?:kc/[a-z0-9-]+|v)/([a-z0-9][a-z0-9-]*)";

/** @param {string | null | undefined} body @returns {string[]} */
export function guideVenueSlugs(body) {
  const seen = new Set();
  const re = new RegExp(GUIDE_VENUE_LINK_PATTERN, "gi");
  for (const match of String(body ?? "").matchAll(re)) {
    seen.add(match[1].toLowerCase());
  }
  return [...seen];
}
