// Guide deep links: https://happitime.biz/guides/{slug}/ and happitime://guides/{slug}
// route to GuideDetail in the app (apps/mobile/src/hooks/useGuideDeepLink.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { parseGuideLink } from "../apps/mobile/src/lib/parseGuideLink.mjs";

test("parses the public guide URL with and without a trailing slash", () => {
  assert.deepEqual(parseGuideLink("https://happitime.biz/guides/westport-happy-hour-guide/"), { slug: "westport-happy-hour-guide", ref: null });
  assert.deepEqual(parseGuideLink("https://www.happitime.biz/guides/westport-happy-hour-guide"), { slug: "westport-happy-hour-guide", ref: null });
});

test("parses the custom-scheme forms", () => {
  assert.deepEqual(parseGuideLink("happitime://guides/kc-streetcar-happy-hour-crawl"), { slug: "kc-streetcar-happy-hour-crawl", ref: null });
  assert.deepEqual(parseGuideLink("happitime://guide?slug=kc-streetcar-happy-hour-crawl&ref=@jwill86"), { slug: "kc-streetcar-happy-hour-crawl", ref: "jwill86" });
});

test("ignores the guides index and every other link", () => {
  assert.equal(parseGuideLink("https://happitime.biz/guides/"), null);
  assert.equal(parseGuideLink("https://happitime.biz/i/0b6a1f6e-2f1c-4c1e-9e0a-2d8a1c3b4d5e"), null);
  assert.equal(parseGuideLink("https://happitime.biz/r/jwill86"), null);
  assert.equal(parseGuideLink("happitime://auth/callback#access_token=x"), null);
  assert.equal(parseGuideLink(42), null);
});

test("rejects slugs that are not slugs", () => {
  assert.equal(parseGuideLink("https://happitime.biz/guides/../admin/"), null);
  assert.equal(parseGuideLink("happitime://guides/UPPER%20case"), null);
});
