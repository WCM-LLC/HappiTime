// scripts/generate-venue-qrs.mjs
//
// Generates branded HappiTime QR codes for venues. Each QR encodes the public
// deep-link/landing URL  https://happitime.app/v/{slug}?src=qr  which the
// directory's /v/[slug] route handles (fires the track-visit attribution event,
// then deep-links to the app or falls back to the web venue page).
//
// Output: outputs/qr/{slug}-1200.png and outputs/qr/{slug}-300.png
//   - error-correction level H (~30%) so the centered brand mark never breaks
//     scannability
//   - a brand-colored center badge with a white "H" drawn programmatically
//     (no logo asset / no image library needed)
//
// Dependencies: `qrcode` (PNG render) + its bundled `pngjs` (compositing). No
// puppeteer, no sharp, no new heavy deps — per the project constraints.
//
// Usage:
//   node scripts/generate-venue-qrs.mjs --slugs sea-capitan,other-venue
//   node scripts/generate-venue-qrs.mjs            # all verified/featured/pilot venues
//   QR_BASE_URL=https://staging.happitime.app node scripts/generate-venue-qrs.mjs --slugs x
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env/.env when
// resolving the venue list from the database (not needed if you pass --slugs and
// --no-db, in which case slugs are used verbatim).

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = (process.env.QR_BASE_URL || 'https://happitime.app').replace(/\/+$/, '');
const OUT_DIR = path.resolve('outputs/qr');
const SIZES = [1200, 300];
// HappiTime brand color (matches apps/mobile adaptiveIcon background).
const BRAND = { r: 0xc8, g: 0x96, b: 0x5a };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

/** Parse `--slugs a,b,c` and flags from argv. */
function parseArgs(argv) {
  const args = { slugs: null, noDb: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slugs') {
      args.slugs = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (argv[i] === '--no-db') {
      args.noDb = true;
    }
  }
  return args;
}

/** The public landing URL encoded into the QR for a venue slug. */
export function venueQrUrl(slug, base = BASE_URL) {
  return `${base}/v/${encodeURIComponent(slug)}?src=qr`;
}

/** Resolve the list of slugs to generate: explicit, or all promoted venues from the DB. */
async function resolveSlugs({ slugs, noDb }) {
  if (slugs && (noDb || slugs.length > 0)) return slugs;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      'Pass --slugs, or set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to resolve promoted venues.',
    );
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('venues')
    .select('slug, promotion_tier')
    .eq('status', 'published')
    .in('promotion_tier', ['verified', 'featured', 'founding_pilot'])
    .not('slug', 'is', null);
  if (error) throw new Error(`Venue lookup failed: ${error.message}`);
  return (data ?? []).map((v) => v.slug).filter(Boolean);
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

async function generateForSlug(slug) {
  const url = venueQrUrl(slug);
  const outputs = [];
  for (const size of SIZES) {
    const buf = await QRCode.toBuffer(url, {
      type: 'png',
      errorCorrectionLevel: 'H',
      width: size,
      margin: 2,
      color: { dark: '#1A1A1Aff', light: '#FFFFFFff' },
    });
    const png = PNG.sync.read(buf);
    drawCenterMark(png);
    const outPath = path.join(OUT_DIR, `${slug}-${size}.png`);
    await writeFile(outPath, PNG.sync.write(png));
    outputs.push(outPath);
  }
  return { slug, url, outputs };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slugs = await resolveSlugs(args);
  if (slugs.length === 0) {
    console.log('[generate-venue-qrs] no slugs to generate.');
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[generate-venue-qrs] base=${BASE_URL}  venues=${slugs.length}`);
  let ok = 0;
  for (const slug of slugs) {
    try {
      const { url, outputs } = await generateForSlug(slug);
      console.log(`  ✓ ${slug}  ${url}`);
      for (const o of outputs) console.log(`      ${path.relative(process.cwd(), o)}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`[generate-venue-qrs] done: ${ok}/${slugs.length} generated → ${path.relative(process.cwd(), OUT_DIR)}/`);
}

// Run only when invoked directly (so venueQrUrl can be imported by tests).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[generate-venue-qrs] fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
