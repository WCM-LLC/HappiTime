// src/utils/review-prefill.mjs
//
// Chooses what seeds the /admin/address-review Accept form. Plain ESM (.mjs) +
// colocated .d.ts so `node --test` can EXECUTE it on CI while the app gets
// types — same arrangement as parse-formatted-address.
//
// Google's `formattedAddress` is a flat string, and splitting it back apart
// mangles leading descriptor segments ("Located in the, 1370 Grand Blvd" lands
// whole in the address field). Places returns the same address as structured
// components, which need no parsing. Prefer those; the parser stays for rows
// with no places_id, which have nothing else to offer.

import { parseFormattedAddress } from "./parse-formatted-address.mjs";

/**
 * @param {{ placesPrefill?: {address?: string, city?: string, state?: string, zip?: string} | null,
 *           googleAddress?: string | null }} input
 */
export function resolveReviewPrefill({ placesPrefill = null, googleAddress = null } = {}) {
  const fromPlaces = placesPrefill?.address?.trim();
  if (fromPlaces) {
    return {
      address: fromPlaces,
      city: placesPrefill.city ?? "",
      state: placesPrefill.state ?? "",
      zip: placesPrefill.zip ?? "",
      source: "places",
    };
  }

  const parsed = parseFormattedAddress(googleAddress);
  if (parsed.address || parsed.city || parsed.state || parsed.zip) {
    return { ...parsed, source: "parsed" };
  }

  return { address: "", city: "", state: "", zip: "", source: "empty" };
}
