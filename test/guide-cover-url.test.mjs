import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Inline the helper so the test has no build dependency on TS compilation.
// The logic must mirror apps/web/src/utils/guide-cover-url.ts and
// apps/directory/src/lib/guideCoverUrl.ts exactly.
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "instagr.am", "www.instagr.am"]);
const INSTAGRAM_MEDIA_TYPES = new Set(["p", "reel", "tv"]);
const OPTIMIZER_PATH = "/api/images/guide-cover";

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

function guideCoverImageSrc(value) {
  const normalized = normalizeGuideCoverImageUrl(value);
  if (!normalized) return null;
  return `${OPTIMIZER_PATH}?url=${encodeURIComponent(normalized)}`;
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

test("guide cover image src routes linked images through the optimizer proxy", () => {
  const src = guideCoverImageSrc("https://images.example.com/kc/photo.jpg?auto=format");
  assert.equal(
    src,
    "/api/images/guide-cover?url=https%3A%2F%2Fimages.example.com%2Fkc%2Fphoto.jpg%3Fauto%3Dformat",
  );
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
    assert.match(source, /guideCoverImageSrc/);
    assert.match(source, /OPTIMIZER_PATH/);
    assert.match(source, /\/media\/\?size=l/);
  }
});

test("guide cover rendering uses Next Image with the optimizer proxy", async () => {
  const adminPreview = await readFile(
    new URL("../apps/web/src/app/admin/guides/[id]/preview/page.tsx", import.meta.url),
    "utf8",
  );
  const directoryGuide = await readFile(
    new URL("../apps/directory/src/app/guides/[slug]/page.tsx", import.meta.url),
    "utf8",
  );

  for (const source of [adminPreview, directoryGuide]) {
    assert.match(source, /from ['"]next\/image['"]/);
    assert.match(source, /guideCoverImageSrc/);
    assert.match(source, /<Image/);
    assert.doesNotMatch(source, /<img/);
  }
});

test("guide cover uploads are accepted by the editor and server actions", async () => {
  const editor = await readFile(
    new URL("../apps/web/src/app/dashboard/guides/components/GuideEditor.tsx", import.meta.url),
    "utf8",
  );
  const guideActions = await readFile(new URL("../apps/web/src/actions/guide-actions.ts", import.meta.url), "utf8");
  const reviewActions = await readFile(
    new URL("../apps/web/src/actions/guide-review-actions.ts", import.meta.url),
    "utf8",
  );
  const uploadHelper = await readFile(new URL("../apps/web/src/utils/guide-cover-upload.ts", import.meta.url), "utf8");

  assert.match(editor, /name="cover_image_file"/);
  assert.match(editor, /type="file"/);
  assert.match(editor, /accept="image\/avif,image\/webp,image\/jpeg,image\/png"/);
  assert.match(uploadHelper, /GUIDE_COVER_BUCKET = 'guide-covers'/);
  assert.match(uploadHelper, /MAX_GUIDE_COVER_BYTES = 5 \* 1024 \* 1024/);
  assert.match(uploadHelper, /resolveGuideCoverImageUrl/);
  assert.match(guideActions, /resolveGuideCoverImageUrl/);
  assert.match(reviewActions, /resolveGuideCoverImageUrl/);
});

test("guide cover optimizer routes block private hosts and enforce image responses", async () => {
  const webRoute = await readFile(
    new URL("../apps/web/src/app/api/images/guide-cover/route.ts", import.meta.url),
    "utf8",
  );
  const directoryRoute = await readFile(
    new URL("../apps/directory/src/app/api/images/guide-cover/route.ts", import.meta.url),
    "utf8",
  );

  for (const source of [webRoute, directoryRoute]) {
    assert.match(source, /isPrivateHostname/);
    assert.match(source, /MAX_IMAGE_BYTES = 8 \* 1024 \* 1024/);
    assert.match(source, /redirect: 'manual'/);
    assert.match(source, /IMAGE_TYPES/);
    assert.match(source, /content-type/);
  }
});

test("guide cover storage migration creates a public non-listable upload bucket", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260527204146_guide_cover_storage_bucket.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /'guide-covers'/);
  assert.match(migration, /5242880/);
  assert.match(migration, /image\/avif/);
  assert.match(migration, /CREATE POLICY guide_covers_insert_own/);
  assert.doesNotMatch(migration, /FOR SELECT/i);
});
