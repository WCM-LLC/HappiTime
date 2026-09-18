// Which source seeds the /admin/address-review Accept form.
//
// The queue row carries Google's `formattedAddress` as a flat string, and
// parsing it back apart mangles leading descriptor segments — "Located in the,
// 1370 Grand Blvd" lands whole in the address field (see
// docs/superpowers/specs/2026-09-11-address-parser-descriptor-segments.md).
// Places returns the same address as structured components, which need no
// parsing at all. Prefer those; keep the parser for rows with no places_id
// (3 of 45 in the live queue), which have nothing else to offer.

import assert from "node:assert/strict";
import test from "node:test";
import { resolveReviewPrefill } from "../apps/web/src/utils/review-prefill.mjs";

// What /api/places/details returns, already built from addressComponents by
// places-parse.ts — the same shape the venue-creation flow consumes.
const placesPrefill = {
  address: "1370 Grand Blvd",
  city: "Kansas City",
  state: "MO",
  zip: "64106",
};

const descriptorAddress = "Located in the, 1370 Grand Blvd, Kansas City, MO 64106, USA";

test("seeds from Places components, which carry no descriptor segment", () => {
  const seed = resolveReviewPrefill({ placesPrefill, googleAddress: descriptorAddress });
  assert.equal(seed.address, "1370 Grand Blvd");
  assert.equal(seed.city, "Kansas City");
  assert.equal(seed.state, "MO");
  assert.equal(seed.zip, "64106");
});

test("reports which source it used so the UI can say so", () => {
  const seed = resolveReviewPrefill({ placesPrefill, googleAddress: descriptorAddress });
  assert.equal(seed.source, "places");
});

test("falls back to the parser when the row has no places_id", () => {
  const seed = resolveReviewPrefill({
    placesPrefill: null,
    googleAddress: "1121 E 16th St, Kansas City, MO 64108, USA",
  });
  assert.equal(seed.address, "1121 E 16th St");
  assert.equal(seed.city, "Kansas City");
  assert.equal(seed.source, "parsed");
});

test("falls back when Places answered but gave no street address", () => {
  // A place with components but no street_number/route — getCity still works,
  // but an empty address field is not something to seed the form with.
  const seed = resolveReviewPrefill({
    placesPrefill: { address: "", city: "Kansas City", state: "MO", zip: "64106" },
    googleAddress: "1121 E 16th St, Kansas City, MO 64108, USA",
  });
  assert.equal(seed.address, "1121 E 16th St");
  assert.equal(seed.source, "parsed");
});

test("yields empty fields when neither source has anything", () => {
  const seed = resolveReviewPrefill({ placesPrefill: null, googleAddress: null });
  assert.deepEqual(seed, { address: "", city: "", state: "", zip: "", source: "empty" });
});
