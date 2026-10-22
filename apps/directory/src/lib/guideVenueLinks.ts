// Plain (server- and client-safe) helper: which venue does a guide link point at?
// Matches the venue-page URL shapes guide_venue_slugs() recognises in SQL:
//   https://happitime.biz/kc/<area>/<slug>[/]   /kc/<area>/<slug>   /v/<slug>
// Neighborhood pages (/kc/<area>/) have no slug segment and do not match.
// Kept out of any "use client" module on purpose: a function exported from a
// client module becomes a client reference and cannot be called on the server
// (that exact mistake 500'd every guide page on 2026-10-22).
const VENUE_HREF_RE =
  /^(?:https?:\/\/(?:www\.)?happitime\.biz)?\/(?:kc\/[a-z0-9-]+|v)\/([a-z0-9][a-z0-9-]*)\/?(?:[?#].*)?$/i;

export function venueSlugFromHref(href: string | undefined | null): string | null {
  if (!href) return null;
  const m = VENUE_HREF_RE.exec(href.trim());
  return m ? m[1].toLowerCase() : null;
}
