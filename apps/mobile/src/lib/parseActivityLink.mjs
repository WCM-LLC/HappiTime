// src/lib/parseActivityLink.mjs
//
// Pure parser for Activity-tab deep links. Plain ESM (.mjs) with a colocated
// parseActivityLink.d.ts — same arrangement as parseVenueLink: the .mjs is what
// `node --test` can EXECUTE on CI (Node 20, no .ts imports), while the app still
// gets types. Note the two are separate constraints — being .mjs makes the logic
// runnable, but CI only DISCOVERS tests via `node --test test/*.test.mjs`, which
// is non-recursive and rooted at the repo root. The test therefore lives at
// test/parse-activity-link.test.mjs, next to its parseVenueLink counterpart.
//
// Matches the custom-scheme form used by App Store marketing deep links:
//   happitime://activity                      → Activity tab, default segment
//   happitime://activity?segment=friends      → Activity tab, Friends segment
// Unknown segments fall back to null (Activity opens on its default tab).
// Returns null for any non-activity URL so the venue/itinerary/auth listeners
// are unaffected.

const SEGMENTS = new Set([
  "notifications",
  "friends",
  "discover",
  "checkins",
  "people",
]);

export function parseActivityLink(url) {
  if (typeof url !== "string") return null;
  const [base, rest = ""] = url.split("?");
  if (!/^happitime:\/\/activity(?:[/?#]|$)/i.test(base)) return null;
  const query = rest.split("#")[0];
  const segMatch = query.match(/(?:^|&)segment=([^&]*)/i);
  let segment = null;
  if (segMatch) {
    let raw;
    try {
      raw = decodeURIComponent(segMatch[1]);
    } catch {
      raw = segMatch[1];
    }
    raw = raw.toLowerCase();
    if (SEGMENTS.has(raw)) segment = raw;
  }
  return { segment };
}
