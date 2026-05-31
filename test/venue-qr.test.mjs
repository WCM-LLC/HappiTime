import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { venueQrUrl, renderVenueQrPng, SIZE_PRESETS } from "@happitime/venue-qr";

test("venueQrUrl encodes slug and appends src=qr", () => {
  assert.equal(
    venueQrUrl("sea-capitan", "https://happitime.biz"),
    "https://happitime.biz/v/sea-capitan?src=qr",
  );
});

test("venueQrUrl strips a trailing slash from base and url-encodes the slug", () => {
  assert.equal(venueQrUrl("a b", "https://x.dev/"), "https://x.dev/v/a%20b?src=qr");
});

test("renderVenueQrPng returns a PNG buffer of the requested pixel size", async () => {
  const buf = await renderVenueQrPng("sea-capitan", { size: 300 });
  const png = PNG.sync.read(buf); // throws if not a valid PNG
  assert.equal(png.width, 300);
  assert.equal(png.height, 300);
});

// Scannability gate: the "iTi" center mark must not eat the error-correction
// margin. Decode the rendered PNG with a strict pure-JS decoder at the WORST
// case (300px digital preset — fewest pixels per module) and assert it still
// reads back the exact landing URL. If jsQR can read it, real phones will.
test("rendered QR still decodes to the landing URL with the iTi mark (300px worst case)", async () => {
  const slug = "sea-capitan";
  const buf = await renderVenueQrPng(slug, { size: 300 });
  const png = PNG.sync.read(buf);
  const result = jsQR(Uint8ClampedArray.from(png.data), png.width, png.height);
  assert.ok(result, "QR failed to decode — center mark is occluding too much");
  assert.equal(result.data, venueQrUrl(slug));
});

test("rendered QR decodes at the largest (postcard 1200px) size too", async () => {
  const slug = "sea-capitan";
  const buf = await renderVenueQrPng(slug, { size: SIZE_PRESETS.postcard.px });
  const png = PNG.sync.read(buf);
  const result = jsQR(Uint8ClampedArray.from(png.data), png.width, png.height);
  assert.ok(result, "QR failed to decode at postcard size");
  assert.equal(result.data, venueQrUrl(slug));
});

test("every SIZE_PRESET is no larger than a 4-inch postcard (1200px)", () => {
  const keys = Object.keys(SIZE_PRESETS);
  assert.ok(keys.includes("postcard") && keys.includes("digital"));
  for (const preset of Object.values(SIZE_PRESETS)) {
    assert.ok(preset.px <= 1200, `${preset.label} exceeds postcard cap`);
  }
});
