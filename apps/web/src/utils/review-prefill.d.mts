// Type declaration for the pure ESM prefill resolver. The implementation lives
// in review-prefill.mjs (plain ESM so `node --test` can import it directly);
// this sidecar gives the strict TS web build its types since tsconfig has
// allowJs:false.
export function resolveReviewPrefill(input?: {
  placesPrefill?: { address?: string; city?: string; state?: string; zip?: string } | null;
  googleAddress?: string | null;
}): {
  address: string;
  city: string;
  state: string;
  zip: string;
  source: 'places' | 'parsed' | 'empty';
};
