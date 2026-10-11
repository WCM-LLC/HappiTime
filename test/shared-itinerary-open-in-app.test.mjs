// test/shared-itinerary-open-in-app.test.mjs
//
// The web copy of a shared itinerary (happitime.biz/i/{token}) must offer an
// explicit way into the installed app.
//
// WHY: Universal Links do not fire for a tap that starts on happitime.biz itself
// (iOS keeps same-domain navigation in Safari), and a guide page's "Open the
// itinerary" card is exactly that. Without a custom-scheme button the reader
// stays on the web, never reaches SharedItineraryScreen, and the guide's author
// earns no check-in credit — the whole point of 20261011041500.
//
// The link the page builds is run through the app's real parser, so the two
// cannot drift.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseItineraryLink } from "../apps/mobile/src/lib/parseItineraryLink.mjs";

const page = readFileSync(
  new URL("../apps/directory/src/app/i/[token]/page.tsx", import.meta.url),
  "utf8",
);

// Lift the page's own builder out of the source and run it (types stripped).
const src = page.slice(page.indexOf("function appDeepLink("), page.indexOf("export async function generateMetadata"));
const appDeepLink = new Function(
  `${src.replace("(token: string, ref: string | string[] | undefined): string", "(token, ref)")}; return appDeepLink;`,
)();

const TOKEN = "3f2b8c1e-0a4d-4e6f-9b7a-1c2d3e4f5a6b";

test("the page's deep link is one the app actually parses, token and ref intact", () => {
  assert.deepEqual(parseItineraryLink(appDeepLink(TOKEN, "jwill86")), { token: TOKEN, ref: "jwill86" });
  assert.deepEqual(parseItineraryLink(appDeepLink(TOKEN, "@JWill86")), { token: TOKEN, ref: "jwill86" });
  assert.deepEqual(parseItineraryLink(appDeepLink(TOKEN, ["jwill86", "other"])), { token: TOKEN, ref: "jwill86" });
});

test("a missing or malformed ref is dropped, never passed through", () => {
  assert.equal(appDeepLink(TOKEN, undefined), `happitime://itinerary?token=${TOKEN}`);
  for (const bad of ["a", "has space", "x&token=evil", "<script>", ""]) {
    assert.equal(appDeepLink(TOKEN, bad), `happitime://itinerary?token=${TOKEN}`, `rejects ${JSON.stringify(bad)}`);
  }
});

test("the page renders the open-in-app button from the request's ref", () => {
  assert.match(page, /const openInAppHref = appDeepLink\(token, \(await searchParams\)\?\.ref\);/);
  assert.match(page, /href=\{openInAppHref\}/);
  assert.match(page, /Open in the HappiTime app/);
  assert.ok(
    page.indexOf("href={openInAppHref}") < page.indexOf("href={APP_STORE_URL}"),
    "open-in-app comes before the store buttons",
  );
});
