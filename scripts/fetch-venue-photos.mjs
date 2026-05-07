#!/usr/bin/env node
/**
 * Fetch venue photos: Google Places first, then venue-owned sources,
 * then Unsplash as a strict last resort.
 *
 * For each venue without media:
 *   1. Try Google Places — search by name + address, download up to 6 photos
 *   2. Try venue-owned sources — website + linked social profiles
 *   3. Fall back to Unsplash — cuisine/tag-based search, 1 cover image
 *
 * Run from project root:
 *   node scripts/fetch-venue-photos.mjs
 *   node scripts/fetch-venue-photos.mjs --dry-run
 *   node scripts/fetch-venue-photos.mjs --skip-website      (skip website scraping)
 *   node scripts/fetch-venue-photos.mjs --skip-google        (skip Google Places)
 *   node scripts/fetch-venue-photos.mjs --unsplash-only      (skip website + Google)
 *
 * Env vars (in .env or environment):
 *   SUPABASE_SERVICE_ROLE_KEY  — required
 *   GOOGLE_PLACES_API_KEY      — required (unless --skip-google / --unsplash-only)
 *   UNSPLASH_ACCESS_KEY        — required for fallback
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL — optional override
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Env loading ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // file not present
  }
}

loadEnvFile(resolve(ROOT, ".env"));
loadEnvFile(resolve(ROOT, "apps/web/.env.local"));
loadEnvFile(resolve(ROOT, "apps/mobile/.env"));

// ─── Config ─────────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://ujflcrjsiyhofnomurco.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_WEBSITE = process.argv.includes("--skip-website");
const SKIP_GOOGLE = process.argv.includes("--skip-google");
const UNSPLASH_ONLY = process.argv.includes("--unsplash-only");

if (!SUPABASE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!UNSPLASH_ONLY && !SKIP_GOOGLE && !PLACES_KEY) {
  console.error("Missing GOOGLE_PLACES_API_KEY. Use --skip-google or --unsplash-only to skip.");
  process.exit(1);
}
if (!UNSPLASH_KEY) {
  console.error("Missing UNSPLASH_ACCESS_KEY (needed as fallback).");
  process.exit(1);
}

if (!process.env.SUPABASE_STORAGE_WRITE_OK) {
  console.error(
    "⛔  This script writes photos to Supabase Storage (legacy).\n" +
    "    New uploads should go to Cloudinary via the import-places Edge Function.\n" +
    "    Set SUPABASE_STORAGE_WRITE_OK=1 to bypass this check if you are sure."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Website scraping ──────────────────────────────────────────────────────

/**
 * Fetch a venue's website and extract image URLs from:
 *   - og:image meta tag
 *   - twitter:image meta tag
 *   - Large <img> tags (skip icons, logos, tiny images)
 */
async function scrapeWebsiteImages(websiteUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HappiTime-PhotoBot/1.0 (venue photo import)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const html = await res.text();
    const images = [];

    // 1. og:image — highest priority
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      images.push({ url: resolveUrl(ogMatch[1], websiteUrl), source: "og:image" });
    }

    // 2. twitter:image
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch?.[1] && twMatch[1] !== ogMatch?.[1]) {
      images.push({ url: resolveUrl(twMatch[1], websiteUrl), source: "twitter:image" });
    }

    // 3. Hero / large images from <img> tags — skip tiny ones, icons, logos
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    const seenUrls = new Set(images.map((i) => i.url));
    while ((match = imgRegex.exec(html)) !== null) {
      if (images.length >= 6) break;

      const src = match[1];
      const fullTag = match[0].toLowerCase();

      // Skip tiny images, icons, logos, tracking pixels, svgs
      if (
        src.includes("logo") ||
        src.includes("icon") ||
        src.includes("favicon") ||
        src.includes("pixel") ||
        src.includes("tracking") ||
        src.includes("badge") ||
        src.includes("avatar") ||
        src.includes(".svg") ||
        src.includes("data:image") ||
        src.includes("1x1") ||
        src.includes("spacer")
      ) continue;

      // Skip if width/height attrs indicate a tiny image
      const widthMatch = fullTag.match(/width=["']?(\d+)/);
      const heightMatch = fullTag.match(/height=["']?(\d+)/);
      if (widthMatch && parseInt(widthMatch[1]) < 200) continue;
      if (heightMatch && parseInt(heightMatch[1]) < 150) continue;

      const resolved = resolveUrl(src, websiteUrl);
      if (resolved && !seenUrls.has(resolved) && isImageUrl(resolved)) {
        seenUrls.add(resolved);
        images.push({ url: resolved, source: "img tag" });
      }
    }

    return images;
  } catch (err) {
    // Timeout, network error, etc.
    return [];
  }
}

async function scrapeSocialImagesFromWebsite(websiteUrl) {
  try {
    const res = await fetch(websiteUrl, { headers: { "User-Agent": "HappiTime-PhotoBot/1.0" } });
    if (!res.ok) return [];
    const html = await res.text();
    const socialUrls = new Set();
    const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href) continue;
      const lower = href.toLowerCase();
      if (lower.includes("instagram.com") || lower.includes("facebook.com") || lower.includes("tiktok.com")) {
        const resolved = resolveUrl(href, websiteUrl);
        if (resolved) socialUrls.add(resolved);
      }
    }
    const images = [];
    for (const socialUrl of socialUrls) {
      const social = await scrapeWebsiteImages(socialUrl);
      for (const img of social) images.push({ ...img, source: `social:${new URL(socialUrl).hostname}` });
      if (images.length >= 6) break;
    }
    return images.slice(0, 6);
  } catch {
    return [];
  }
}

function resolveUrl(src, base) {
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

function isImageUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes(".jpg") ||
    lower.includes(".jpeg") ||
    lower.includes(".png") ||
    lower.includes(".webp") ||
    // Many CMS image URLs don't have extensions
    lower.includes("/image") ||
    lower.includes("/photo") ||
    lower.includes("/media") ||
    lower.includes("/uploads") ||
    lower.includes("/wp-content")
  );
}

/**
 * Download an image from a URL. Returns null on failure.
 */
async function downloadImage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HappiTime-PhotoBot/1.0",
        Accept: "image/*",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = new Uint8Array(await res.arrayBuffer());
    // Skip tiny images (< 5KB likely icons/placeholders)
    if (buffer.byteLength < 5_000) return null;

    return { data: buffer, contentType };
  } catch {
    return null;
  }
}

/**
 * Try scraping the venue's website for photos.
 * Returns number of photos uploaded, or 0 on failure.
 */
async function tryWebsite(venue) {
  if (!venue.website) return 0;

  let url = venue.website.trim();
  if (!url.startsWith("http")) url = `https://${url}`;

  const images = await scrapeWebsiteImages(url);
  const socialImages = await scrapeSocialImagesFromWebsite(url);
  const merged = [...images, ...socialImages].slice(0, 6);
  if (merged.length === 0) return 0;

  if (DRY_RUN) {
    console.log(`\n      Website/Social: found ${merged.length} images`);
    for (const img of merged) console.log(`        ${img.source}: ${img.url.substring(0, 80)}...`);
    return merged.length;
  }

  let uploaded = 0;
  for (let i = 0; i < Math.min(merged.length, 6); i++) {
    const img = merged[i];
    const result = await downloadImage(img.url);
    if (!result) continue;

    const ext = result.contentType.includes("png") ? "png"
      : result.contentType.includes("webp") ? "webp"
      : "jpg";
    const storagePath = `website/${venue.id}/${i}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("venue-media")
      .upload(storagePath, result.data, { contentType: result.contentType, upsert: true });

    if (upErr) {
      console.error(`\n      upload err: ${upErr.message}`);
      continue;
    }

    const { error: dbErr } = await supabase.from("venue_media").insert({
      venue_id: venue.id,
      type: "image",
      title: `From ${new URL(url).hostname}`,
      storage_bucket: "venue-media",
      storage_path: storagePath,
      sort_order: uploaded,
      source: img.source.startsWith("social:") ? "social_media" : "website",
      status: "published",
    });

    if (dbErr) {
      console.error(`\n      db err: ${dbErr.message}`);
      continue;
    }

    uploaded++;
    await sleep(100);
  }

  return uploaded;
}

// ─── Google Places ──────────────────────────────────────────────────────────

async function searchPlace(name, address) {
  const query = encodeURIComponent(`${name} ${address}`);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id,photos&key=${PLACES_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.candidates?.[0] ?? null;
}

async function getPlacePhotos(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${PLACES_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result?.photos ?? [];
}

async function downloadGooglePhoto(photoRef, maxWidth = 800) {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoRef}&key=${PLACES_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google photo download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Try Google Places for a venue. Returns number of photos uploaded, or 0 on failure.
 */
async function tryGooglePlaces(venue) {
  const place = await searchPlace(venue.name, `${venue.address} ${venue.city}`);
  if (!place?.place_id) return 0;

  const photos = await getPlacePhotos(place.place_id);
  if (photos.length === 0) return 0;

  const batch = photos.slice(0, 6);
  let uploaded = 0;

  for (let i = 0; i < batch.length; i++) {
    const ref = batch[i].photo_reference;

    if (DRY_RUN) {
      uploaded++;
      continue;
    }

    const data = await downloadGooglePhoto(ref);
    const path = `places/${venue.id}/${ref.substring(0, 120)}.jpg`;

    const { error: upErr } = await supabase.storage
      .from("venue-media")
      .upload(path, data, { contentType: "image/jpeg", upsert: true });

    if (upErr) {
      console.error(`\n      upload err: ${upErr.message}`);
      continue;
    }

    const { error: dbErr } = await supabase.from("venue_media").insert({
      venue_id: venue.id,
      type: "image",
      title: "Google Places",
      storage_bucket: "venue-media",
      storage_path: path,
      sort_order: i,
      source: "google_places",
      status: "published",
    });

    if (dbErr) {
      console.error(`\n      db err: ${dbErr.message}`);
      continue;
    }

    uploaded++;
    await sleep(150);
  }

  return uploaded;
}

// ─── Unsplash fallback ──────────────────────────────────────────────────────

function buildSearchTerms(venue) {
  const terms = [];
  const cuisine = venue.cuisine_type;
  const tags = venue.tags || [];

  if (cuisine) {
    const vibes = tags.filter((t) =>
      ["patio", "rooftop", "dive bar", "lounge", "taproom", "sports bar", "brewery", "wine bar", "cocktail bar"].includes(
        t.toLowerCase()
      )
    );
    for (const vibe of vibes) {
      terms.push(`${cuisine} restaurant ${vibe}`);
    }
    terms.push(`${cuisine} restaurant`);
    terms.push(`${cuisine} food`);
  }

  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (["patio", "rooftop", "dive bar", "lounge", "taproom", "sports bar", "brewery", "wine bar", "cocktail bar"].includes(lower)) {
      terms.push(`${tag} happy hour`);
    }
  }

  terms.push("happy hour bar");
  terms.push("cocktail bar restaurant");
  terms.push("bar drinks food");

  return terms;
}

async function searchUnsplash(query) {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "1");
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
  });

  if (res.status === 403 || res.status === 429) {
    console.warn(`\n      Unsplash rate limit (${res.status}). Waiting 30s...`);
    await sleep(30_000);
    return null;
  }

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;

  const photo = data.results[0];
  return {
    downloadUrl: photo.urls?.regular || photo.urls?.full,
    photographer: photo.user?.name || "Unknown",
    profileUrl: photo.user?.links?.html || "https://unsplash.com",
    unsplashUrl: photo.links?.html || "https://unsplash.com",
    downloadLocation: photo.links?.download_location,
  };
}

/**
 * Try Unsplash for a venue. Returns true on success.
 */
async function tryUnsplash(venue) {
  const terms = buildSearchTerms(venue);

  let photo = null;
  for (const term of terms) {
    photo = await searchUnsplash(term);
    if (photo) break;
    await sleep(200);
  }

  if (!photo) return false;

  console.log(`\n      Unsplash: "${photo.photographer}"`);

  if (DRY_RUN) return true;

  // Download
  const res = await fetch(photo.downloadUrl);
  if (!res.ok) return false;
  const imageData = new Uint8Array(await res.arrayBuffer());

  // Trigger Unsplash download tracking
  if (photo.downloadLocation) {
    try {
      await fetch(photo.downloadLocation, {
        headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
      });
    } catch {}
  }

  // Upload to storage
  const storagePath = `covers/${venue.id}/cover.jpg`;
  const { error: upErr } = await supabase.storage
    .from("venue-media")
    .upload(storagePath, imageData, { contentType: "image/jpeg", upsert: true });

  if (upErr) {
    console.error(`\n      upload err: ${upErr.message}`);
    return false;
  }

  // Create venue_media record
  const attribution = `Photo by ${photo.photographer} on Unsplash (${photo.unsplashUrl})`;
  const { error: dbErr } = await supabase.from("venue_media").insert({
    venue_id: venue.id,
    type: "image",
    title: attribution,
    storage_bucket: "venue-media",
    storage_path: storagePath,
    sort_order: 0,
    source: "unsplash",
    status: "published",
  });

  if (dbErr) {
    console.error(`\n      db err: ${dbErr.message}`);
    return false;
  }

  return true;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const strategy = UNSPLASH_ONLY
    ? "Unsplash only"
    : [
        !SKIP_GOOGLE ? "Google Places" : null,
        !SKIP_WEBSITE ? "Website/Social" : null,
        "Unsplash",
      ]
        .filter(Boolean)
        .join(" → ");

  console.log("============================================");
  console.log("  HappiTime — Venue Photo Fetcher");
  console.log(`  Strategy  : ${strategy}`);
  console.log(`  Supabase  : ${SUPABASE_URL}`);
  if (DRY_RUN) console.log("  MODE      : DRY RUN (no changes)");
  console.log("============================================\n");

  // 1. Get all published venues
  const { data: venues, error: venueErr } = await supabase
    .from("venues")
    .select("id, name, address, city, website, cuisine_type, tags")
    .eq("status", "published")
    .order("name");

  if (venueErr) {
    console.error("DB error:", venueErr.message);
    process.exit(1);
  }

  // 2. Find which ones already have media
  const { data: mediaRows } = await supabase.from("venue_media").select("venue_id");
  const withMedia = new Set((mediaRows || []).map((m) => m.venue_id));
  const needPhotos = venues.filter((v) => !withMedia.has(v.id));

  console.log(`Total venues: ${venues.length}`);
  console.log(`Already have media: ${withMedia.size}`);
  console.log(`Need photos: ${needPhotos.length}\n`);

  if (needPhotos.length === 0) {
    console.log("All venues have media. Nothing to do.");
    return;
  }

  // 3. Process each venue
  let website = 0,
    google = 0,
    unsplash = 0,
    failed = 0;

  for (let i = 0; i < needPhotos.length; i++) {
    const venue = needPhotos[i];
    const label = `[${i + 1}/${needPhotos.length}] ${venue.name}`;
    process.stdout.write(`  ${label}...`);

    try {
      // Step 1: Try Google Places (unless --skip-google or --unsplash-only)
      if (!SKIP_GOOGLE && !UNSPLASH_ONLY) {
        const googleCount = await tryGooglePlaces(venue);
        if (googleCount > 0) {
          console.log(` Google: ${googleCount} photos`);
          google++;
          await sleep(250);
          continue;
        }
        process.stdout.write(" Google: miss →");
      }

      // Step 2: Try venue website/social (unless --skip-website or --unsplash-only)
      if (!SKIP_WEBSITE && !UNSPLASH_ONLY && venue.website) {
        const websiteCount = await tryWebsite(venue);
        if (websiteCount > 0) {
          console.log(` Website/Social: ${websiteCount} photos`);
          website++;
          await sleep(500);
          continue;
        }
        process.stdout.write(" Website/Social: miss →");
      }

      // Step 3: Unsplash fallback
      const unsplashOk = await tryUnsplash(venue);
      if (unsplashOk) {
        console.log(" Unsplash: 1 cover");
        unsplash++;
      } else {
        console.log(" no photos found");
        failed++;
      }
    } catch (err) {
      console.log(` error: ${err.message}`);
      failed++;
    }

    await sleep(300);
  }

  // 4. Summary
  console.log("\n============================================");
  console.log("  Results");
  console.log(`  Website       : ${website} venues`);
  console.log(`  Google Places : ${google} venues`);
  console.log(`  Unsplash      : ${unsplash} venues`);
  console.log(`  No photos     : ${failed} venues`);
  console.log("============================================");
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
