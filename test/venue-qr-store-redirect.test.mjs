// Venue QR zero-tap store routing (OPTION_B_ATTRIBUTION_SPEC.md §4 D1).
// A phone that renders /v/{slug} doesn't have the app (Universal/App Links would
// have intercepted), so it goes straight to its store; everything else keeps the
// landing page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isNoRedirect,
  mobileStoreOs,
  playStoreUrlFor,
  serverScanSessionId,
  storeRedirectFor,
} from "../apps/directory/src/lib/storeRedirect.mjs";

const APP = "https://apps.apple.com/us/app/happitime/id6757933269";
const PLAY = "https://play.google.com/store/apps/details?id=com.jwill7486.happitime.mobile";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  googlebotMobile:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  whatsappPreview: "WhatsApp/2.23.20.0 A",
  facebookPreview: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  windowsPhone:
    "Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0 Mobile Safari/537.36 Edge/15.14977",
};

test("phones route to their own store", () => {
  assert.equal(mobileStoreOs(UA.iphoneSafari), "ios");
  assert.equal(mobileStoreOs(UA.iphoneInstagram), "ios");
  assert.equal(mobileStoreOs(UA.androidChrome), "android");
});

test("desktop, bots, previews and unknown UAs keep the landing page", () => {
  for (const ua of [UA.macSafari, UA.windowsChrome, UA.googlebotMobile, UA.whatsappPreview, UA.facebookPreview, UA.windowsPhone, "", null, undefined]) {
    assert.equal(mobileStoreOs(ua), null, String(ua));
  }
});

test("storeRedirectFor picks the right URL and honours ?nr=1", () => {
  const base = { slug: "tacos-valentina", appStoreUrl: APP, playStoreUrl: PLAY };
  assert.deepEqual(storeRedirectFor({ ...base, userAgent: UA.iphoneSafari }), { os: "ios", url: APP });
  const android = storeRedirectFor({ ...base, userAgent: UA.androidChrome });
  assert.equal(android.os, "android");
  assert.ok(android.url.startsWith(`${PLAY}&referrer=`));
  assert.equal(storeRedirectFor({ ...base, userAgent: UA.macSafari }), null);
  assert.equal(storeRedirectFor({ ...base, userAgent: UA.iphoneSafari, noRedirect: true }), null);
});

test("Play referrer round-trips the venue slug", () => {
  const url = new URL(playStoreUrlFor(PLAY, "tacos-valentina"));
  assert.equal(url.searchParams.get("id"), "com.jwill7486.happitime.mobile");
  const ref = new URLSearchParams(url.searchParams.get("referrer"));
  assert.equal(ref.get("utm_source"), "qr");
  assert.equal(ref.get("utm_campaign"), "tacos-valentina");
});

test("isNoRedirect", () => {
  assert.equal(isNoRedirect("1"), true);
  assert.equal(isNoRedirect("true"), true);
  assert.equal(isNoRedirect(["1"]), true);
  assert.equal(isNoRedirect(undefined), false);
  assert.equal(isNoRedirect("0"), false);
});

test("server scan session id is stable per device and hides the IP", () => {
  const a = serverScanSessionId("203.0.113.9", UA.iphoneSafari);
  assert.equal(a, serverScanSessionId("203.0.113.9", UA.iphoneSafari));
  assert.notEqual(a, serverScanSessionId("203.0.113.10", UA.iphoneSafari));
  assert.match(a, /^srv-[0-9a-f]{32}$/);
  assert.ok(!a.includes("203"));
});

test("/v/[slug] wires the redirect and uses the canonical store links", () => {
  const page = readFileSync(new URL("../apps/directory/src/app/v/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /from "@\/lib\/storeLinks"/);
  assert.match(page, /storeRedirectFor\(/);
  assert.match(page, /redirect\(store\.url\)/);
  // Scan must be counted before the redirect throws.
  assert.ok(page.indexOf("await recordServerScan(") < page.indexOf("redirect(store.url)"));
});

test("no directory page ships the dead Play Store URL", () => {
  for (const rel of ["v/[slug]/page.tsx", "i/[token]/page.tsx", "kc/page.tsx"]) {
    const src = readFileSync(new URL(`../apps/directory/src/app/${rel}`, import.meta.url), "utf8");
    assert.ok(!src.includes("play.google.com/store/apps/happitime"), rel);
  }
});
