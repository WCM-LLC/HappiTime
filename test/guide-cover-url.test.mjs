import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Inline the helper so the test has no build dependency on TS compilation.
// The logic must mirror apps/web/src/utils/guide-cover-url.ts and
// apps/directory/src/lib/guideCoverUrl.ts exactly.
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "instagr.am", "www.instagr.am"]);
const INSTAGRAM_MEDIA_TYPES = new Set(["p", "reel", "tv"]);

function normalizeGuideCoverImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) {
    return raw;
  }

  const [mediaType, shortcode] = url.pathname.split("/").filter(Boolean);
  if (!mediaType || !shortcode || !INSTAGRAM_MEDIA_TYPES.has(mediaType.toLowerCase())) {
    return raw;
  }

  return `https://www.instagram.com/${mediaType.toLowerCase()}/${shortcode}/media/?size=l`;
}

test("guide cover URLs normalize Instagram post links to image media endpoints", () => {
  const url = normalizeGuideCoverImageUrl(
    "https://www.instagram.com/p/DWyvbhwkQIo/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  );

  assert.equal(url, "https://www.instagram.com/p/DWyvbhwkQIo/media/?size=l");
});

test("guide cover URLs preserve direct image URLs", () => {
  const url = "https://images.example.com/kc/photo.jpg?auto=format";
  assert.equal(normalizeGuideCoverImageUrl(url), url);
});

test("web and directory guide cover helpers both include Instagram normalization", async () => {
  const webHelper = await readFile(
    new URL("../apps/web/src/utils/guide-cover-url.ts", import.meta.url),
    "utf8",
  );
  const directoryHelper = await readFile(
    new URL("../apps/directory/src/lib/guideCoverUrl.ts", import.meta.url),
    "utf8",
  );

  for (const source of [webHelper, directoryHelper]) {
    assert.match(source, /INSTAGRAM_HOSTS/);
    assert.match(source, /INSTAGRAM_MEDIA_TYPES/);
    assert.match(source, /\/media\/\?size=l/);
  }
});
