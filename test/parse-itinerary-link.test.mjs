import test from "node:test";
import assert from "node:assert/strict";
import { parseItineraryLink } from "../apps/mobile/src/lib/parseItineraryLink.mjs";

const TOKEN = "d5a87d1d-64d6-4566-9e91-d0c844884516";

test("parses the https Universal Link form", () => {
  assert.deepEqual(parseItineraryLink(`https://happitime.biz/i/${TOKEN}`), { token: TOKEN });
});

test("parses the https form with a trailing slash", () => {
  assert.deepEqual(parseItineraryLink(`https://happitime.biz/i/${TOKEN}/`), { token: TOKEN });
});

test("parses a subdomain host", () => {
  assert.deepEqual(parseItineraryLink(`https://www.happitime.biz/i/${TOKEN}`), { token: TOKEN });
});

test("parses the custom-scheme form", () => {
  assert.deepEqual(parseItineraryLink(`happitime://itinerary?token=${TOKEN}`), { token: TOKEN });
});

test("rejects a non-uuid token", () => {
  assert.equal(parseItineraryLink("https://happitime.biz/i/not-a-uuid"), null);
});

test("ignores venue and auth links", () => {
  assert.equal(parseItineraryLink("https://happitime.biz/v/sea-capitan?src=qr"), null);
  assert.equal(parseItineraryLink("happitime://auth/callback?code=abc"), null);
});

test("ignores non-string input", () => {
  assert.equal(parseItineraryLink(null), null);
  assert.equal(parseItineraryLink(undefined), null);
});
