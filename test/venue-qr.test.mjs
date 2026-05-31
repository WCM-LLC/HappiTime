import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { venueQrUrl, renderVenueQrPng, SIZE_PRESETS } from "@happitime/venue-qr";

test("venueQrUrl encodes slug and appends src=qr", () => {
  assert.equal(
    venueQrUrl("sea-capitan", "https://happitime.app"),
    "https://happitime.app/v/sea-capitan?src=qr",
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

test("every SIZE_PRESET is no larger than a 4-inch postcard (1200px)", () => {
  const keys = Object.keys(SIZE_PRESETS);
  assert.ok(keys.includes("postcard") && keys.includes("digital"));
  for (const preset of Object.values(SIZE_PRESETS)) {
    assert.ok(preset.px <= 1200, `${preset.label} exceeds postcard cap`);
  }
});
