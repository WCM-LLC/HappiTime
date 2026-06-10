import test from "node:test";
import assert from "node:assert/strict";
import { parseVenueLink } from "../apps/mobile/src/lib/parseVenueLink.mjs";
import { parseItineraryLink } from "../apps/mobile/src/lib/parseItineraryLink.mjs";

test("venue link extracts ref", () => {
  assert.deepEqual(
    parseVenueLink("https://happitime.biz/v/some-bar?src=qr&ref=jwill86"),
    { slug: "some-bar", src: "qr", ref: "jwill86" }
  );
  assert.equal(parseVenueLink("https://happitime.biz/v/some-bar").ref, null);
});
test("itinerary link extracts ref", () => {
  const token = "11111111-1111-1111-1111-111111111111";
  assert.deepEqual(
    parseItineraryLink(`https://happitime.biz/i/${token}?ref=jwill86`),
    { token, ref: "jwill86" }
  );
  assert.equal(parseItineraryLink(`https://happitime.biz/i/${token}`).ref, null);
});
