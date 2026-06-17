// Type declaration for the pure ESM parser. The implementation lives in
// parse-formatted-address.mjs (plain ESM so `node --test` can import it
// directly); this sidecar gives the strict TS web build its types since
// tsconfig has allowJs:false.
export function parseFormattedAddress(
  formatted: string | null | undefined,
): { address: string; city: string; state: string; zip: string };
