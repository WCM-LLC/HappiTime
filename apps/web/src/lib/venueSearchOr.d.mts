// Type declaration for the pure ESM venue-search filter builder. The
// implementation lives in venueSearchOr.mjs (plain ESM so `node --test` can
// import it directly); this sidecar gives the strict TS web build its types
// since tsconfig has allowJs:false.
// (VENUE_SEARCH_FIELDS is exported by the .mjs for the test file but omitted
// here — declaring a typed const trips next lint's JS parser on .d.mts files.)
export function buildVenueSearchOr(input: string | null | undefined): string | null;
