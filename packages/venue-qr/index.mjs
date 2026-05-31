// packages/venue-qr/index.mjs
//
// Single source of truth for venue QR codes: the public landing URL and the
// branded PNG (error-correction level H + a centered HappiTime "H" badge).
// Imported by both scripts/generate-venue-qrs.mjs (CLI) and the web download
// route, so the brand mark can never drift. Zero side effects — safe to import
// from a Next.js route handler.

import QRCode from "qrcode";
import { PNG } from "pngjs";

// Default to the directory app's canonical domain (apps/directory metadataBase),
// which serves the /v/[slug] landing route. Override with QR_BASE_URL for staging.
const DEFAULT_BASE = (process.env.QR_BASE_URL || "https://happitime.biz").replace(/\/+$/, "");
const BRAND = { r: 0xc8, g: 0x96, b: 0x5a };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

// Print-size presets, capped at a 4" postcard. px = inches * 300 DPI (QR is square).
export const SIZE_PRESETS = {
  postcard: { px: 1200, inches: 4, label: "Postcard" },
  table_tent: { px: 900, inches: 3, label: "Table tent" },
  coaster: { px: 750, inches: 2.5, label: "Coaster" },
  sticker: { px: 600, inches: 2, label: "Sticker" },
  digital: { px: 300, inches: null, label: "Digital" },
};

/** The public landing URL encoded into the QR for a venue slug. */
export function venueQrUrl(slug, base = DEFAULT_BASE) {
  return `${base.replace(/\/+$/, "")}/v/${encodeURIComponent(slug)}?src=qr`;
}

function setPixel(png, x, y, c) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = c.r;
  png.data[idx + 1] = c.g;
  png.data[idx + 2] = c.b;
  png.data[idx + 3] = 255;
}

function fillRect(png, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) setPixel(png, x, y, c);
  }
}

/**
 * Draws the centered HappiTime mark: a white knockout square (quiet zone), a
 * brand-colored badge, and a white "H" glyph rendered from three bars.
 */
function drawCenterMark(png) {
  const size = png.width;
  const badge = Math.round(size * 0.22); // brand square
  const pad = Math.round(badge * 0.16); // white knockout border around the badge
  const cx = Math.round((size - badge) / 2);
  const cy = Math.round((size - badge) / 2);

  fillRect(png, cx - pad, cy - pad, badge + pad * 2, badge + pad * 2, WHITE);
  fillRect(png, cx, cy, badge, badge, BRAND);

  // White "H": two vertical bars + one horizontal cross-bar, inset in the badge.
  const inset = Math.round(badge * 0.26);
  const barW = Math.round(badge * 0.14);
  const innerX = cx + inset;
  const innerY = cy + inset;
  const innerW = badge - inset * 2;
  const innerH = badge - inset * 2;
  fillRect(png, innerX, innerY, barW, innerH, WHITE); // left leg
  fillRect(png, innerX + innerW - barW, innerY, barW, innerH, WHITE); // right leg
  fillRect(png, innerX, innerY + Math.round((innerH - barW) / 2), innerW, barW, WHITE); // cross-bar
}

/** Render a branded venue QR PNG at `size` pixels square. Returns a Buffer. */
export async function renderVenueQrPng(slug, { size = 1200, base = DEFAULT_BASE } = {}) {
  const buf = await QRCode.toBuffer(venueQrUrl(slug, base), {
    type: "png",
    errorCorrectionLevel: "H",
    width: size,
    margin: 2,
    color: { dark: "#1A1A1Aff", light: "#FFFFFFff" },
  });
  const png = PNG.sync.read(buf);
  drawCenterMark(png);
  return PNG.sync.write(png);
}
