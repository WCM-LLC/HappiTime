// Builds the PostgREST or() filter string for admin venue search.
// Plain ESM (like socialUrl.mjs) so `node --test` can import it directly;
// types live in the venueSearchOr.d.mts sidecar.

// Columns an admin can match on. Broader than the venues table's visible
// columns on purpose: "find ANY venue" includes half-remembered addresses.
export const VENUE_SEARCH_FIELDS = [
  "name",
  "org_name",
  "city",
  "state",
  "address",
  "neighborhood",
  "slug",
];

// Strip characters that would break the PostgREST or() filter grammar
// (commas separate filters; parens group them; % is the ilike wildcard we
// add ourselves). Same sanitization as mobile's useVenueSearch.
export function buildVenueSearchOr(input) {
  const safe = (input ?? "").toString().replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
  if (!safe) return null;
  const like = `%${safe}%`;
  return VENUE_SEARCH_FIELDS.map((f) => `${f}.ilike.${like}`).join(",");
}
