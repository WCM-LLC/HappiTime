// packages/venue-qr/index.mjs
//
// Single source of truth for venue QR codes: the public landing URL and the
// branded PNG (error-correction level H + a centered HappiTime "iTi" badge —
// the brand mark from Logo.tsx: white "iTi" on the brand-colored disc).
// Imported by both scripts/generate-venue-qrs.mjs (CLI) and the web download
// route, so the brand mark can never drift. Zero side effects — safe to import
// from a Next.js route handler. The "iTi" glyph art is base64-inlined in
// ./iti-mark.mjs (regenerate via scripts/gen-iti-mark.mjs); only its alpha
// channel is used here, painted white over the disc.

import QRCode from "qrcode";
import { PNG } from "pngjs";
import { ITI_MARK_PNG_BASE64 } from "./iti-mark.mjs";

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

/** Alpha-blend color `c` at coverage `a` (0..1) over the existing opaque pixel. */
function blendPixel(png, x, y, c, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  const ia = 1 - a;
  png.data[idx] = Math.round(c.r * a + png.data[idx] * ia);
  png.data[idx + 1] = Math.round(c.g * a + png.data[idx + 1] * ia);
  png.data[idx + 2] = Math.round(c.b * a + png.data[idx + 2] * ia);
  png.data[idx + 3] = 255;
}

/** Filled disc with a 1px anti-aliased edge. */
function fillCircle(png, cx, cy, r, c) {
  const x0 = Math.floor(cx - r - 1);
  const x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(cy - r - 1);
  const y1 = Math.ceil(cy + r + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = Math.min(1, Math.max(0, r + 0.5 - d)); // 1px AA band
      if (cov > 0) blendPixel(png, x, y, c, cov);
    }
  }
}

// Lazily decode the inlined "iTi" mark to an alpha grid (memoized). Pure compute,
// no I/O — keeps the module import inert.
let _itiMark = null;
function itiMark() {
  if (_itiMark) return _itiMark;
  const png = PNG.sync.read(Buffer.from(ITI_MARK_PNG_BASE64, "base64"));
  const alpha = new Uint8Array(png.width * png.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = png.data[(i << 2) + 3];
  _itiMark = { width: png.width, height: png.height, alpha };
  return _itiMark;
}

/** Box-average the mark's alpha down to `tw`x`th`, returning coverage in 0..1. */
function sampleAlpha(mark, tw, th) {
  const { width: sw, height: sh, alpha } = mark;
  const out = new Float32Array(tw * th);
  for (let ty = 0; ty < th; ty++) {
    const iy0 = Math.floor((ty * sh) / th);
    const iy1 = Math.min(sh, Math.ceil(((ty + 1) * sh) / th));
    for (let tx = 0; tx < tw; tx++) {
      const ix0 = Math.floor((tx * sw) / tw);
      const ix1 = Math.min(sw, Math.ceil(((tx + 1) * sw) / tw));
      let sum = 0;
      let cnt = 0;
      for (let sy = iy0; sy < iy1; sy++) {
        for (let sx = ix0; sx < ix1; sx++) {
          sum += alpha[sy * sw + sx];
          cnt++;
        }
      }
      out[ty * tw + tx] = cnt ? sum / cnt / 255 : 0;
    }
  }
  return out;
}

/**
 * Draws the centered HappiTime mark: a white knockout ring (quiet zone), the
 * brand-colored disc, and the white "iTi" wordmark composited on top. Occlusion
 * stays within the QR's error-correction-H budget (disc ≈ 22% of width).
 */
function drawCenterMark(png) {
  const size = png.width;
  const cx = size / 2;
  const cy = size / 2;
  const diameter = Math.round(size * 0.22);
  const r = diameter / 2;
  const ring = Math.round(diameter * 0.16); // white knockout around the disc

  fillCircle(png, cx, cy, r + ring, WHITE);
  fillCircle(png, cx, cy, r, BRAND);

  // White "iTi", height-fit inside the disc with padding; width keeps the mark's
  // aspect ratio. Only the alpha channel of the asset drives coverage.
  const mark = itiMark();
  const th = Math.round(diameter * 0.42);
  const tw = Math.round(th * (mark.width / mark.height));
  const cov = sampleAlpha(mark, tw, th);
  const ox = Math.round(cx - tw / 2);
  const oy = Math.round(cy - th / 2);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      blendPixel(png, ox + x, oy + y, WHITE, cov[y * tw + x]);
    }
  }
}

/** Shared branded QR renderer: encode `url` at `size` px with the iTi center mark. */
async function renderBrandedQrPng(url, size) {
  const buf = await QRCode.toBuffer(url, {
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

/** Render a branded venue QR PNG at `size` pixels square. Returns a Buffer. */
export async function renderVenueQrPng(slug, { size = 1200, base = DEFAULT_BASE } = {}) {
  return renderBrandedQrPng(venueQrUrl(slug, base), size);
}

/** The public landing URL encoded into an Insider's personal referral QR. */
export function referralQrUrl(handle, base = DEFAULT_BASE) {
  return `${base.replace(/\/+$/, "")}/r/${encodeURIComponent(String(handle).replace(/^@/, "").toLowerCase())}`;
}

/** Render a branded referral QR PNG for a handle. Returns a PNG Buffer. */
export async function renderReferralQrPng(handle, opts = {}) {
  return renderBrandedQrPng(referralQrUrl(handle, opts.base), opts.size ?? 600);
}
