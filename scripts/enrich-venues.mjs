/**
 * scripts/enrich-venues.mjs
 *
 * Enriches venues with lat/lng, rating, review_count, website, phone,
 * and a cover photo from the Google Places API.
 *
 * Usage:
 *   node scripts/enrich-venues.mjs
 *
 * Required .env at repo root (or apps/web/.env.local):
 *   GOOGLE_PLACES_API_KEY=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   NEXT_PUBLIC_SUPABASE_URL=...   (or EXPO_PUBLIC_SUPABASE_URL)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── env loading ──────────────────────────────────────────────────────────────

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
    // file not present — skip silently
  }
}

loadEnvFile(resolve(ROOT, '.env'));
loadEnvFile(resolve(ROOT, 'apps/web/.env.local'));
loadEnvFile(resolve(ROOT, 'apps/mobile/.env'));

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_API_KEY) {
  console.error('✗  GOOGLE_PLACES_API_KEY is missing (add to .env at repo root)');
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.error('✗  NEXT_PUBLIC_SUPABASE_URL is missing');
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error('✗  SUPABASE_SERVICE_ROLE_KEY is missing (add to .env at repo root)');
  process.exit(1);
}

if (!process.env.SUPABASE_STORAGE_WRITE_OK) {
  console.error(
    '⛔  This script writes photos to Supabase Storage (legacy).\n' +
    '    New uploads should go to Cloudinary via the import-places Edge Function.\n' +
    '    Set SUPABASE_STORAGE_WRITE_OK=1 to bypass this check if you are sure.'
  );
  process.exit(1);
}

// ─── rate-limiter (10 req/s) ──────────────────────────────────────────────────

const RATE_MS = 100; // 10 requests per second
let _lastCall = 0;

async function gFetch(url) {
  const now = Date.now();
  const wait = RATE_MS - (now - _lastCall);
  if (wait > 0) await sleep(wait);
  _lastCall = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url.split('?')[0]}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Supabase REST helpers (no SDK needed) ─────────────────────────────────────

const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

async function supaFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...SUPA_HEADERS, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${init.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function getVenuesToEnrich() {
  // Venues missing coords OR already have places_id but missing rating/review data
  return supaFetch(
    '/rest/v1/venues' +
    '?select=id,org_id,name,address,city,state,zip,lat,lng,places_id,places_status,places_attempts' +
    '&or=(lat.is.null,lng.is.null,rating.is.null)' +
    '&order=name.asc',
  );
}

async function updateVenue(id, patch) {
  await supaFetch(`/rest/v1/venues?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

async function upsertVenueMedia(row) {
  await supaFetch('/rest/v1/venue_media', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
}

async function uploadToStorage(storagePath, buffer, contentType) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/venue-media/${storagePath}`,
    {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${text}`);
  return `${SUPABASE_URL}/storage/v1/object/public/venue-media/${storagePath}`;
}

// ─── Google Places API helpers ────────────────────────────────────────────────

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

async function findPlaceId(venue) {
  const parts = [venue.name];
  if (venue.address) parts.push(venue.address);
  if (venue.city)    parts.push(venue.city);
  if (venue.state)   parts.push(venue.state);
  const input = parts.join(', ');

  const params = new URLSearchParams({
    input,
    inputtype: 'textquery',
    fields: 'place_id,name',
    key: GOOGLE_API_KEY,
  });

  const data = await gFetch(`${PLACES_BASE}/findplacefromtext/json?${params}`);

  if (data.status === 'OK' && data.candidates?.length > 0) {
    return { placeId: data.candidates[0].place_id, query: input };
  }
  if (data.status === 'ZERO_RESULTS') {
    return { placeId: null, query: input };
  }
  throw new Error(`findplacefromtext status: ${data.status}`);
}

async function getPlaceDetails(placeId) {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: [
      'geometry',
      'formatted_address',
      'photos',
      'rating',
      'user_ratings_total',
      'website',
      'formatted_phone_number',
    ].join(','),
    key: GOOGLE_API_KEY,
  });

  const data = await gFetch(`${PLACES_BASE}/details/json?${params}`);

  if (data.status === 'OK') return data.result;
  throw new Error(`Place details status: ${data.status}`);
}

async function fetchPhoto(photoReference) {
  // The Places Photo API redirects to the actual image — follow it
  const params = new URLSearchParams({
    maxwidth: '1600',
    photo_reference: photoReference,
    key: GOOGLE_API_KEY,
  });

  const now = Date.now();
  const wait = RATE_MS - (now - _lastCall);
  if (wait > 0) await sleep(wait);
  _lastCall = Date.now();

  const res = await fetch(`${PLACES_BASE}/photo?${params}`);
  if (!res.ok) return null;

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), contentType };
}

// ─── Per-venue enrichment ──────────────────────────────────────────────────────

async function enrichVenue(venue) {
  // 1. Find place_id (skip if already known)
  let placeId = venue.places_id ?? null;
  if (!placeId) {
    const found = await findPlaceId(venue);
    if (!found.placeId) {
      return { ok: false, reason: `No Places match for "${found.query}"` };
    }
    placeId = found.placeId;
  }

  // 2. Place Details
  const details = await getPlaceDetails(placeId);
  const lat = details.geometry?.location?.lat ?? null;
  const lng = details.geometry?.location?.lng ?? null;

  // 3. Update venues row
  const patch = {
    lat,
    lng,
    places_id: placeId,
    places_status: 'success',
    places_last_synced_at: new Date().toISOString(),
    places_attempts: (venue.places_attempts ?? 0) + 1,
  };
  if (details.rating != null)             patch.rating = details.rating;
  if (details.user_ratings_total != null) patch.review_count = details.user_ratings_total;
  if (details.website)                    patch.website = details.website;
  if (details.formatted_phone_number)     patch.phone = details.formatted_phone_number;

  await updateVenue(venue.id, patch);

  // 4. Cover photo — skip if one already exists in venue_media
  let photoUploaded = false;
  const existingMedia = await supaFetch(
    `/rest/v1/venue_media?venue_id=eq.${encodeURIComponent(venue.id)}&sort_order=eq.0&select=id&limit=1`,
  );
  const photoRef = !existingMedia?.length ? (details.photos?.[0]?.photo_reference ?? null) : null;
  if (photoRef) {
    const photo = await fetchPhoto(photoRef);
    if (photo) {
      const storagePath = `${venue.org_id}/${venue.id}/cover.jpg`;
      await uploadToStorage(storagePath, photo.buffer, photo.contentType);
      await upsertVenueMedia({
        venue_id: venue.id,
        storage_bucket: 'venue-media',
        storage_path: storagePath,
        type: 'image',
        status: 'published',
        sort_order: 0,
        title: 'Cover photo (Places API)',
      });
      photoUploaded = true;
    }
  }

  return { ok: true, lat, lng, photoUploaded };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  HappiTime — venue enrichment script');
  console.log(`  Supabase : ${SUPABASE_URL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const venues = await getVenuesToEnrich();
  console.log(`Found ${venues.length} venues with missing coordinates\n`);

  if (venues.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Prime the rate limiter so the very first API call isn't throttled
  await sleep(RATE_MS);

  const stats = {
    updated: 0,
    photosUploaded: 0,
    noMatch: /** @type {{ name:string, city:string, state:string, reason:string }[]} */ ([]),
    errors: /** @type {{ name:string, error:string }[]} */ ([]),
  };

  for (let i = 0; i < venues.length; i++) {
    const v = venues[i];
    const tag = `[${String(i + 1).padStart(2)}/${venues.length}]`;
    const label = `${v.name} — ${v.city ?? '?'}, ${v.state ?? '?'}`;
    process.stdout.write(`${tag} ${label}\n`);

    try {
      const result = await enrichVenue(v);

      if (result.ok) {
        stats.updated++;
        if (result.photoUploaded) stats.photosUploaded++;
        const coordStr = result.lat != null
          ? `lat=${result.lat.toFixed(5)}, lng=${result.lng.toFixed(5)}`
          : 'no coords returned';
        const photoStr = result.photoUploaded ? ' + photo' : '';
        console.log(`      ✓ ${coordStr}${photoStr}`);
      } else {
        stats.noMatch.push({ name: v.name, city: v.city, state: v.state, reason: result.reason });
        console.log(`      ✗ ${result.reason}`);
      }
    } catch (err) {
      stats.errors.push({ name: v.name, error: err.message });
      console.error(`      ✗ ERROR: ${err.message}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Results');
  console.log(`  Venues processed   : ${venues.length}`);
  console.log(`  Updated (lat/lng)  : ${stats.updated}`);
  console.log(`  Photos uploaded    : ${stats.photosUploaded}`);
  console.log(`  No match           : ${stats.noMatch.length}`);
  console.log(`  Errors             : ${stats.errors.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (stats.noMatch.length > 0) {
    console.log('\nVenues with no Places match — handle manually:');
    for (const v of stats.noMatch) {
      console.log(`  · ${v.name} | ${v.city ?? ''}, ${v.state ?? ''}`);
      console.log(`    Reason: ${v.reason}`);
    }
  }

  if (stats.errors.length > 0) {
    console.log('\nErrors (may retry):');
    for (const v of stats.errors) {
      console.log(`  · ${v.name}: ${v.error}`);
    }
  }

  if (stats.noMatch.length === 0 && stats.errors.length === 0) {
    console.log('\n✓ All venues enriched successfully.');
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
