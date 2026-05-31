import test from "node:test";
import assert from "node:assert/strict";
import { parseVenueLink } from "../apps/mobile/src/lib/parseVenueLink.mjs";

test("parses the custom-scheme venue link with src", () => {
  assert.deepEqual(parseVenueLink("happitime://venue/sea-capitan?src=qr"), {
    slug: "sea-capitan",
    src: "qr",
  });
});

test("parses the https landing form the same way", () => {
  assert.deepEqual(parseVenueLink("https://happitime.biz/v/sea-capitan?src=qr"), {
    slug: "sea-capitan",
    src: "qr",
  });
});

test("url-decodes the slug", () => {
  assert.deepEqual(parseVenueLink("happitime://venue/a%20b?src=qr"), { slug: "a b", src: "qr" });
});

test("returns src=null when the param is absent", () => {
  assert.deepEqual(parseVenueLink("happitime://venue/sea-capitan"), {
    slug: "sea-capitan",
    src: null,
  });
});

test("ignores non-venue deep links (auth)", () => {
  assert.equal(parseVenueLink("happitime://auth/callback?code=x"), null);
});

test("returns null when the slug is missing", () => {
  assert.equal(parseVenueLink("happitime://venue/"), null);
});

test("rejects a look-alike domain", () => {
  assert.equal(parseVenueLink("https://evil.com/v/sea-capitan?src=qr"), null);
});

test("accepts a happitime.biz subdomain (staging)", () => {
  assert.deepEqual(parseVenueLink("https://staging.happitime.biz/v/sea-capitan?src=qr"), {
    slug: "sea-capitan",
    src: "qr",
  });
});

test("returns null for non-string input", () => {
  assert.equal(parseVenueLink(undefined), null);
});
