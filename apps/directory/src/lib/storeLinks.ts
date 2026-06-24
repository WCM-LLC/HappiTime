/**
 * Canonical app-store links for the directory site — one source of truth.
 *
 * iOS id 6757933269 matches eas.json ascAppId + the mobile app's storeLinks.ts.
 * The Android package com.jwill7486.happitime.mobile matches the mobile build
 * config (package/bundleIdentifier) and public/.well-known/assetlinks.json — it
 * was confirmed against the live Play Store listing (2026-06-24). Do NOT use the
 * old placeholders (biz.happitime.app, com.happitime, the fake iOS id6478000000).
 */
export const APP_STORE_URL =
  "https://apps.apple.com/us/app/happitime/id6757933269";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.jwill7486.happitime.mobile";

/**
 * Builds a scannable QR-code image URL (SVG) for the given data, brand-colored
 * to match the directory (#1A1A1A on white). Uses the public api.qrserver.com
 * endpoint, the same one the source design mockup used.
 */
export function qrSrc(data: string, size = 120): string {
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    margin: "0",
    qzone: "1",
    color: "1A1A1A",
    bgcolor: "FFFFFF",
    format: "svg",
    data,
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}
