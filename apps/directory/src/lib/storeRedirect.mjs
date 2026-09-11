// Types only live in storeRedirect.d.ts — the implementation is plain ESM so
// `node --test` (test/venue-qr-store-redirect.test.mjs) can execute it directly.
//
// Zero-tap store routing for the venue QR landing (/v/[slug]) —
// OPTION_B_ATTRIBUTION_SPEC.md §4 D1.
//
// Why a server redirect is safe: iOS Universal Links and Android App Links
// intercept https://happitime.biz/v/* BEFORE the browser loads the page. So if
// this page is being rendered on a phone at all, the app isn't installed (or the
// person deliberately chose the browser) — send them straight to their store.
// Desktop, crawlers, link-preview bots and `?nr=1` (QA "no redirect") keep the
// normal landing page.

import { createHash } from "node:crypto";

// Store URLs are passed in by the caller (page.tsx imports them from
// ./storeLinks.ts, the single source of truth) — this file can't import .ts and
// still run under `node --test` on CI's Node 20.

// Link-preview fetchers and crawlers: never redirect or count them. Several of
// these spoof a mobile UA (WhatsApp, Telegram, iMessage previews).
const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|slack|discord|linkedin|pinterest|vkshare|w3c_validator|headless|lighthouse/i;

/** "ios" | "android" | null (desktop, bot, or unknown). */
export function mobileStoreOs(userAgent) {
  if (typeof userAgent !== "string" || userAgent.length === 0) return null;
  if (BOT_UA.test(userAgent)) return null;
  // Windows Phone UAs contain "Android" — not a Play device.
  if (/windows phone/i.test(userAgent)) return null;
  if (/android/i.test(userAgent)) return "android";
  // iPadOS Safari reports a Macintosh UA by default; indistinguishable from a
  // Mac server-side, so those iPads get the landing page (with store buttons).
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return null;
}

/**
 * Play Store listing with an install referrer attached. Android passes the
 * referrer through to the app on first launch (Play Install Referrer API) — not
 * read by the app yet, but it costs nothing to start stamping it now.
 */
export function playStoreUrlFor(playStoreUrl, slug) {
  const referrer = new URLSearchParams({
    utm_source: "qr",
    utm_medium: "venue_qr",
    utm_campaign: String(slug),
  }).toString();
  const sep = playStoreUrl.includes("?") ? "&" : "?";
  return `${playStoreUrl}${sep}referrer=${encodeURIComponent(referrer)}`;
}

/**
 * Where to send a scanner, or null to render the landing page.
 * @param {{ userAgent: string | null | undefined, slug: string, noRedirect?: boolean,
 *           appStoreUrl: string, playStoreUrl: string }} input
 */
export function storeRedirectFor({ userAgent, slug, noRedirect = false, appStoreUrl, playStoreUrl }) {
  if (noRedirect) return null;
  const os = mobileStoreOs(userAgent ?? "");
  if (os === "ios") return { os, url: appStoreUrl };
  if (os === "android") return { os, url: playStoreUrlFor(playStoreUrl, slug) };
  return null;
}

/** True for the QA escape hatch `?nr=1` (also accepts nr=true). */
export function isNoRedirect(nr) {
  const v = Array.isArray(nr) ? nr[0] : nr;
  return v === "1" || v === "true";
}

/**
 * Stable-ish anonymous session id for a server-side scan count, so one phone
 * re-scanning inside track-visit's 4h window dedupes instead of inflating the
 * venue's numbers. Hashed — the raw IP is never sent or stored.
 */
export function serverScanSessionId(ip, userAgent) {
  const digest = createHash("sha256")
    .update(`${ip ?? ""}|${userAgent ?? ""}`)
    .digest("hex")
    .slice(0, 32);
  return `srv-${digest}`;
}
