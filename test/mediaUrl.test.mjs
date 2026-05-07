import test from "node:test";
import assert from "node:assert/strict";

// Inline the helper so the test has no build dependency on TS compilation.
// The logic must mirror apps/directory/src/lib/mediaUrl.ts exactly.
const CLOUDINARY_CLOUD = "dhucspghz";
function venueImageUrl(media, opts = {}) {
  if (media.storage_bucket === "cloudinary") {
    if (media.type === "menu_pdf") {
      return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/raw/upload/${media.storage_path}`;
    }
    const resourceType = media.type === "video" ? "video" : "image";
    const transforms = ["f_auto", "q_auto"];
    if (opts.w || opts.h) {
      transforms.push(`c_${opts.crop ?? "limit"}`);
      if (opts.w) transforms.push(`w_${opts.w}`);
      if (opts.h) transforms.push(`h_${opts.h}`);
    }
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/${resourceType}/upload/${transforms.join(",")}/${media.storage_path}`;
  }
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ujflcrjsiyhofnomurco.supabase.co").replace(/\/+$/, "");
  return `${supabaseUrl}/storage/v1/object/public/${media.storage_bucket}/${media.storage_path}`;
}

test("cloudinary row — no opts produces f_auto,q_auto only", () => {
  const url = venueImageUrl({ storage_bucket: "cloudinary", storage_path: "happitime/venues/v1/m1" });
  assert.equal(url, "https://res.cloudinary.com/dhucspghz/image/upload/f_auto,q_auto/happitime/venues/v1/m1");
});

test("cloudinary row — width adds c_limit,w_X transforms", () => {
  const url = venueImageUrl({ storage_bucket: "cloudinary", storage_path: "happitime/venues/v1/m1" }, { w: 800 });
  assert.equal(url, "https://res.cloudinary.com/dhucspghz/image/upload/f_auto,q_auto,c_limit,w_800/happitime/venues/v1/m1");
});

test("cloudinary row — width + height uses both", () => {
  const url = venueImageUrl({ storage_bucket: "cloudinary", storage_path: "happitime/venues/v1/m1" }, { w: 400, h: 300 });
  assert.equal(url, "https://res.cloudinary.com/dhucspghz/image/upload/f_auto,q_auto,c_limit,w_400,h_300/happitime/venues/v1/m1");
});

test("cloudinary row — fill crop overrides default limit", () => {
  const url = venueImageUrl({ storage_bucket: "cloudinary", storage_path: "happitime/venues/v1/m1" }, { w: 640, crop: "fill" });
  assert.equal(url, "https://res.cloudinary.com/dhucspghz/image/upload/f_auto,q_auto,c_fill,w_640/happitime/venues/v1/m1");
});

test("legacy venue-media row produces Supabase Storage URL", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ujflcrjsiyhofnomurco.supabase.co";
  const url = venueImageUrl({ storage_bucket: "venue-media", storage_path: "places/v1/photo.jpg" });
  assert.equal(url, "https://ujflcrjsiyhofnomurco.supabase.co/storage/v1/object/public/venue-media/places/v1/photo.jpg");
});

test("legacy venue-media row ignores width opts (no CDN transforms)", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ujflcrjsiyhofnomurco.supabase.co";
  const url = venueImageUrl({ storage_bucket: "venue-media", storage_path: "places/v1/photo.jpg" }, { w: 800 });
  // Legacy rows don't get Cloudinary transforms — opts are ignored
  assert.equal(url, "https://ujflcrjsiyhofnomurco.supabase.co/storage/v1/object/public/venue-media/places/v1/photo.jpg");
});

test("trailing slash in SUPABASE_URL is stripped", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ujflcrjsiyhofnomurco.supabase.co/";
  const url = venueImageUrl({ storage_bucket: "venue-media", storage_path: "img.jpg" });
  assert.ok(!url.includes("//storage"), `double slash in URL: ${url}`);
});

test("cloudinary menu_pdf uses /raw/upload/ with no transforms", () => {
  const url = venueImageUrl({ storage_bucket: "cloudinary", storage_path: "happitime/venues/v1/menu.pdf", type: "menu_pdf" });
  assert.equal(url, "https://res.cloudinary.com/dhucspghz/raw/upload/happitime/venues/v1/menu.pdf");
});

test("cloudinary menu_pdf ignores width opts", () => {
  const url = venueImageUrl({ storage_bucket: "cloudinary", storage_path: "happitime/venues/v1/menu.pdf", type: "menu_pdf" }, { w: 800 });
  assert.equal(url, "https://res.cloudinary.com/dhucspghz/raw/upload/happitime/venues/v1/menu.pdf");
});

test("cloudinary video uses /video/upload/ resource path", () => {
  const url = venueImageUrl({ storage_bucket: "cloudinary", storage_path: "happitime/venues/v1/tour.mp4", type: "video" });
  assert.equal(url, "https://res.cloudinary.com/dhucspghz/video/upload/f_auto,q_auto/happitime/venues/v1/tour.mp4");
});

test("cloudinary video with width uses /video/upload/ with transforms", () => {
  const url = venueImageUrl({ storage_bucket: "cloudinary", storage_path: "happitime/venues/v1/tour.mp4", type: "video" }, { w: 1280 });
  assert.equal(url, "https://res.cloudinary.com/dhucspghz/video/upload/f_auto,q_auto,c_limit,w_1280/happitime/venues/v1/tour.mp4");
});
