#!/usr/bin/env node
/**
 * scripts/fetch-venue-covers.mjs
 *
 * Fetches cover photos from Unsplash for venues that have no venue_media records.
 * Uploads images to Supabase Storage and creates venue_media rows with attribution.
 *
 * Usage:
 *   node scripts/fetch-venue-covers.mjs
 *   node scripts/fetch-venue-covers.mjs --dry-run
 *
 * Required env vars:
 *   UNSPLASH_ACCESS_KEY        — Unsplash API key
 *   SUPABASE_SERVICE_ROLE_KEY  — Supabase service-role key
 *   SUPABASE_URL               — (optional) overrides default project URL
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Env loading ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // file not present
  }
}

loadEnvFile(resolve(ROOT, '.env'));
loadEnvFile(resolve(ROOT, 'apps/web/.env.local'));
loadEnvFile(resolve(ROOT, 'apps/mobile/.env'));

// ─── Config ──────────────────────────────────────────────────────────────────

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL
  || process.env.EXPO_PUBLIC_SUPABASE_URL
  || 'https://ujflcrjsiyhofnomurco.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 5;

if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.');
  process.exit(1);
}
if (!UNSPLASH_ACCESS_KEY) {
  console.error('Missing UNSPLASH_ACCESS_KEY env var.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build an array of search queries from venue data, ordered from most specific
 * to most generic so we can fall back gracefully.
 */
function buildSearchTerms(venue) {
  const terms = [];
  const cuisine = venue.cuisine_type;
  const tags = venue.tags || [];

  // Most specific: cuisine + descriptive tag combos
  if (cuisine) {
    const vibes = tags.filter((t) =>
      ['patio', 'rooftop', 'dive bar', 'lounge', 'taproom', 'sports bar', 'brewery', 'wine bar', 'cocktail bar'].includes(t.toLowerCase())
    );
    for (const vibe of vibes) {
      terms.push(`${cuisine} restaurant ${vibe}`);
    }
    terms.push(`${cuisine} restaurant`);
    terms.push(`${cuisine} food`);
  }

  // Tag-based queries
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (['patio', 'rooftop', 'dive bar', 'lounge', 'taproom', 'sports bar', 'brewery', 'wine bar', 'cocktail bar'].includes(lower)) {
      terms.push(`${tag} happy hour`);
    }
  }

  // Generic fallbacks
  terms.push('happy hour bar');
  terms.push('cocktail bar restaurant');
  terms.push('bar drinks food');

  return terms;
}

/**
 * Search Unsplash for a photo. Returns the first result or null.
 */
async function searchUnsplash(query) {
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '1');
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });

  if (res.status === 403 || res.status === 429) {
    console.warn(`    Unsplash rate limit hit (${res.status}). Waiting 30s...`);
    await sleep(30_000);
    return null;
  }

  if (!res.ok) {
    console.warn(`    Unsplash error ${res.status} for query "${query}"`);
    return null;
  }

  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;

  const photo = data.results[0];
  return {
    downloadUrl: photo.urls?.regular || photo.urls?.full,
    photographer: photo.user?.name || 'Unknown',
    profileUrl: photo.user?.links?.html || 'https://unsplash.com',
    unsplashUrl: photo.links?.html || 'https://unsplash.com',
    // Unsplash API guidelines: trigger a download event
    downloadLocation: photo.links?.download_location,
  };
}

/**
 * Try each search term in order until we get a result.
 */
async function findPhoto(venue) {
  const terms = buildSearchTerms(venue);
  for (const term of terms) {
    const result = await searchUnsplash(term);
    if (result) {
      return { ...result, searchTerm: term };
    }
    // Small delay between searches
    await sleep(200);
  }
  return null;
}

/**
 * Download image bytes from a URL.
 */
async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Trigger Unsplash download tracking (required by their API guidelines).
 */
async function triggerDownloadEvent(downloadLocation) {
  if (!downloadLocation) return;
  try {
    await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    });
  } catch {
    // Non-critical — best effort
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('============================================');
  console.log('  HappiTime — Unsplash Venue Cover Fetcher');
  console.log(`  Supabase : ${SUPABASE_URL}`);
  if (DRY_RUN) console.log('  MODE     : DRY RUN (no changes)');
  console.log('============================================\n');

  // 1. Get all venues
  const { data: venues, error: venueErr } = await supabase
    .from('venues')
    .select('id, name, cuisine_type, tags, city, state')
    .eq('status', 'published')
    .order('name');

  if (venueErr) {
    console.error('Failed to fetch venues:', venueErr.message);
    process.exit(1);
  }

  // 2. Get venue IDs that already have media
  const { data: mediaRows, error: mediaErr } = await supabase
    .from('venue_media')
    .select('venue_id');

  if (mediaErr) {
    console.error('Failed to fetch venue_media:', mediaErr.message);
    process.exit(1);
  }

  const withMedia = new Set((mediaRows || []).map((m) => m.venue_id));
  const needCovers = venues.filter((v) => !withMedia.has(v.id));

  console.log(`Total venues: ${venues.length}`);
  console.log(`Already have media: ${withMedia.size}`);
  console.log(`Need covers: ${needCovers.length}\n`);

  if (needCovers.length === 0) {
    console.log('Nothing to do — all venues have media.');
    return;
  }

  // 3. Process in batches
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < needCovers.length; i += BATCH_SIZE) {
    const batch = needCovers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(needCovers.length / BATCH_SIZE);

    console.log(`--- Batch ${batchNum}/${totalBatches} ---`);

    for (const venue of batch) {
      const label = `${venue.name} (${venue.city || '?'}, ${venue.state || '?'})`;
      console.log(`  [${i + batch.indexOf(venue) + 1}/${needCovers.length}] ${label}`);
      console.log(`    cuisine: ${venue.cuisine_type || 'none'} | tags: ${(venue.tags || []).join(', ') || 'none'}`);

      try {
        const photo = await findPhoto(venue);

        if (!photo) {
          console.log('    -> No suitable photo found. Skipping.');
          skipped++;
          continue;
        }

        console.log(`    -> Found: "${photo.searchTerm}" by ${photo.photographer}`);

        if (DRY_RUN) {
          console.log('    -> [DRY RUN] Would download and upload cover.');
          success++;
          continue;
        }

        // Download image
        const imageData = await downloadImage(photo.downloadUrl);
        console.log(`    -> Downloaded ${(imageData.byteLength / 1024).toFixed(0)} KB`);

        // Trigger Unsplash download tracking
        await triggerDownloadEvent(photo.downloadLocation);

        // Upload to Supabase Storage
        const storagePath = `covers/${venue.id}/cover.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('venue-media')
          .upload(storagePath, imageData, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (uploadErr) {
          console.error(`    -> Upload error: ${uploadErr.message}`);
          failed++;
          continue;
        }

        // Create venue_media record with Unsplash attribution
        const attribution = `Photo by ${photo.photographer} on Unsplash (${photo.unsplashUrl})`;
        const { error: dbErr } = await supabase.from('venue_media').insert({
          venue_id: venue.id,
          type: 'image',
          title: attribution,
          storage_bucket: 'venue-media',
          storage_path: storagePath,
          sort_order: 0,
          status: 'published',
        });

        if (dbErr) {
          console.error(`    -> DB error: ${dbErr.message}`);
          failed++;
          continue;
        }

        console.log('    -> Uploaded and saved.');
        success++;
      } catch (err) {
        console.error(`    -> Error: ${err.message}`);
        failed++;
      }
    }

    // Rate-limit pause between batches
    if (i + BATCH_SIZE < needCovers.length) {
      console.log('  (pausing 2s between batches...)\n');
      await sleep(2000);
    }
  }

  // 4. Summary
  console.log('\n============================================');
  console.log('  Results');
  console.log(`  Success  : ${success}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Failed   : ${failed}`);
  console.log('============================================');
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
