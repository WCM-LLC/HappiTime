#!/usr/bin/env node
/**
 * scripts/intake-venue.mjs
 *
 * AI VENUE INTAKE AGENT (v0.1)
 *
 * Input:  a venue name, website URL, or Google Place ID.
 * Output: a JSON draft listing ready for the HappiTime schema
 *         (venues + happy_hour_windows + optional menu draft + social links).
 *
 * THIS SCRIPT DOES NOT WRITE TO THE DATABASE. It produces a JSON file
 * (or stdout) that you can review, hand to the venue owner for sign-off,
 * and only then upsert via the existing console flow or a separate writer.
 *
 * Pipeline:
 *   1. DISCOVER   — given a name, resolve to a Google Place ID via Places
 *                  Text Search; given a URL or place_id, skip ahead.
 *   2. PLACES     — pull authoritative location data from Google Places
 *                  Details (address, lat/lng, phone, website, hours, rating).
 *   3. SCRAPE     — fetch the venue website + any linked happy-hour page.
 *                  Strip HTML to a token-efficient text payload.
 *   4. EXTRACT    — call Claude with the cleaned text + Places data and
 *                  ask for a structured JSON draft (windows, offers, tags,
 *                  neighborhood, social URLs, price tier).
 *   5. VALIDATE   — enum + shape checks; mark per-field confidence; flag
 *                  anything that needs human review.
 *   6. EMIT       — write to scripts/intake-output/<slug>.json (default)
 *                  or stdout when --stdout is passed.
 *
 * Usage:
 *   node scripts/intake-venue.mjs --name "Tacos Valentina Kansas City"
 *   node scripts/intake-venue.mjs --url https://seacapitankc.com
 *   node scripts/intake-venue.mjs --place-id ChIJ... --out custom.json
 *   node scripts/intake-venue.mjs --name "Earl's Premier" --stdout
 *
 * Required env (loaded from .env, apps/web/.env.local, apps/mobile/.env):
 *   ANTHROPIC_API_KEY        — Claude API key
 *   GOOGLE_PLACES_API_KEY    — same key already used by enrich-venues.mjs
 *
 * Optional env:
 *   INTAKE_MODEL             — Claude model id (default claude-sonnet-4-6)
 *   INTAKE_HTTP_TIMEOUT_MS   — per-request timeout (default 15000)
 *   INTAKE_MAX_TEXT_CHARS    — cap on scraped text fed to Claude (default 30000)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ─── env loading (mirrors enrich-venues.mjs) ────────────────────────────────

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
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    /* missing file is fine */
  }
}

// Skip .env file loading entirely when INTAKE_SKIP_ENV_FILES=1 — used by tests
// to exercise the missing-env code paths even when the repo root has keys set.
if (process.env.INTAKE_SKIP_ENV_FILES !== "1") {
  loadEnvFile(resolve(ROOT, ".env"));
  loadEnvFile(resolve(ROOT, "apps/web/.env.local"));
  loadEnvFile(resolve(ROOT, "apps/mobile/.env"));
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const MODEL = process.env.INTAKE_MODEL || "claude-sonnet-4-6";
const HTTP_TIMEOUT_MS = Number(process.env.INTAKE_HTTP_TIMEOUT_MS || 15000);
const MAX_TEXT_CHARS = Number(process.env.INTAKE_MAX_TEXT_CHARS || 30000);

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { stdout: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") out.name = argv[++i];
    else if (a === "--url") out.url = argv[++i];
    else if (a === "--place-id") out.placeId = argv[++i];
    else if (a === "--out") out.outPath = argv[++i];
    else if (a === "--stdout") out.stdout = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function printUsage() {
  console.log(`Usage:
  node scripts/intake-venue.mjs --name "Venue Name"
  node scripts/intake-venue.mjs --url https://venue.example.com
  node scripts/intake-venue.mjs --place-id ChIJ...
Optional:
  --out path/to/file.json   write to a specific path
  --stdout                  print the JSON to stdout instead of writing a file
`);
}

// ─── small utils ─────────────────────────────────────────────────────────────

function slugify(str) {
  return String(str || "venue")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── 1. DISCOVER + 2. PLACES ────────────────────────────────────────────────

async function placesTextSearch(query) {
  // https://developers.google.com/maps/documentation/places/web-service/text-search
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&key=${GOOGLE_API_KEY}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Places text search failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK") {
    throw new Error(`Places text search status=${data.status} for "${query}"`);
  }
  const hit = data.results?.[0];
  if (!hit) throw new Error(`No Places hit for "${query}"`);
  return hit.place_id;
}

async function placesDetails(placeId) {
  // Only request fields we actually use, to keep API cost low.
  const fields = [
    "place_id",
    "name",
    "formatted_address",
    "address_components",
    "geometry/location",
    "international_phone_number",
    "website",
    "url",
    "rating",
    "user_ratings_total",
    "price_level",
    "opening_hours",
    "current_opening_hours",
    "editorial_summary",
    "types",
    "business_status",
  ].join(",");
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Places details failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK") {
    throw new Error(`Places details status=${data.status}`);
  }
  return data.result;
}

function unpackAddressComponents(components) {
  const get = (type) =>
    components?.find((c) => c.types?.includes(type))?.long_name || null;
  return {
    street_number: get("street_number"),
    route: get("route"),
    city:
      get("locality") ||
      get("sublocality_level_1") ||
      get("postal_town") ||
      null,
    neighborhood: get("neighborhood") || null,
    state: get("administrative_area_level_1"),
    zip: get("postal_code"),
  };
}

// ─── 3. SCRAPE ──────────────────────────────────────────────────────────────

async function scrapeText(url) {
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HappiTimeIntake/0.1; +https://happitime.biz)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return htmlToText(html).slice(0, MAX_TEXT_CHARS);
  } catch {
    return null;
  }
}

function discoverHappyHourLinks(html) {
  // Cheap pre-fetch of candidate happy-hour subpages.
  const matches = [...html.matchAll(/href="([^"]+)"[^>]*>([^<]{0,80})</gi)];
  const candidates = [];
  for (const m of matches) {
    const href = m[1];
    const text = (m[2] || "").toLowerCase();
    if (/happy\s*hour|specials|deals|menu/.test(text)) {
      candidates.push(href);
    }
  }
  return [...new Set(candidates)].slice(0, 4);
}

// ─── 4. EXTRACT (Claude) ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an extraction agent for HappiTime, a happy-hour
discovery platform. Given (a) Google Places data and (b) scraped text from a
venue's website/social, produce a strict JSON draft of a HappiTime listing.

The HappiTime schema you must populate:

venue: {
  name: string,                           // venue name as it appears publicly
  org_name?: string,                      // parent company / restaurant group if obvious
  address: string,                        // street address
  city: string, state: string, zip: string,
  neighborhood?: string,                  // KC examples: Crossroads, Westport, River Market, Plaza
  phone?: string,                         // E.164 if possible
  website?: string,
  facebook_url?: string,
  instagram_url?: string,
  tiktok_url?: string,
  price_tier?: 1 | 2 | 3 | 4,             // mirror Google's price_level if present
  tags: string[]                          // short lowercase tags: cuisine, vibe, key categories
}

happy_hour_windows: [{
  dow: number[],                          // 0=Sunday .. 6=Saturday — array of days this window applies
  start_time: "HH:MM",                    // 24h local time
  end_time: "HH:MM",
  label?: string                          // e.g. "Weekday Happy Hour", "Late Night"
}]

menu: {                                   // optional — only emit if a happy-hour
  name: string,                           // menu is clearly described on the scraped page
  sections: [{
    name: string,                         // e.g. "Eats", "Drinks"
    items: [{
      name: string,                       // item as written
      price: number | null,               // decimal, or null for "X off" deals
      description?: string                // optional modifier
    }]
  }]
}

EXTRACTION RULES:
- Only emit fields you have evidence for. Use null/omit if unsure.
- For social URLs, look for facebook.com, instagram.com, tiktok.com links in the text.
- For windows, recognize patterns like "Mon-Fri 3-6pm", "Daily 4-7", "Sun-Thu all day".
- Convert times to 24h. "Open to close" → omit if no concrete times.
- Tags: 3-7 short lowercase items. Examples: ["tacos","mexican","crossroads","brewery-adjacent","family-friendly"].
- Neighborhood: only for KC metro venues; pick from common KC neighborhoods.
- If the venue has NO discoverable happy hour, return happy_hour_windows: [] and omit the menu key.
- Menu extraction here is best-effort. Only emit a menu if a published menu page
  clearly lists items + prices. Field operators capture better menus on-site.
- Output STRICT JSON. No markdown fences. No commentary.

ALSO RETURN per-field confidence under a top-level "_confidence" object using:
  "high"   = directly stated on website or Places
  "medium" = inferred from strong context
  "low"    = guess
Include "_confidence" keys ONLY for fields you populated.

ALSO RETURN a "_review_flags" string array listing fields a human must verify
before publishing (e.g. ["happy_hour_windows.0.dow", "phone"]). Be conservative:
if a happy hour exists, flag the windows AND the offers for owner sign-off.`;

async function callClaude({ placesData, scrapedTexts }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is missing. Add it to .env at the repo root."
    );
  }

  const userPayload = {
    google_places: placesData,
    scraped_pages: scrapedTexts, // [{url, text}]
  };

  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    timeoutMs: 60_000,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extract a HappiTime draft listing from the data below. " +
                "Return strict JSON only.\n\n" +
                JSON.stringify(userPayload, null, 2),
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  const usage = data?.usage || null;

  // Defensive JSON parse — strip code fences if the model ever adds them.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Claude returned non-JSON. First 300 chars:\n${cleaned.slice(0, 300)}`
    );
  }
  return { parsed, usage };
}

// ─── 5. VALIDATE ────────────────────────────────────────────────────────────

const PRICE_TIERS = new Set([1, 2, 3, 4]);
// Matches HappiTime's menu shape: { name, sections: [{ name, items: [{ name, price, description }] }] }
// Menu extraction from the CLI is best-effort — for real menus, use the
// /intake/capture phone tool (photo-based) which is far more accurate.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateDraft(draft) {
  const errors = [];
  const v = draft?.venue || {};
  if (!v.name) errors.push("venue.name is required");
  if (v.price_tier != null && !PRICE_TIERS.has(v.price_tier))
    errors.push("venue.price_tier must be 1-4");

  const windows = Array.isArray(draft?.happy_hour_windows)
    ? draft.happy_hour_windows
    : [];
  windows.forEach((w, i) => {
    if (!Array.isArray(w.dow) || w.dow.length === 0)
      errors.push(`happy_hour_windows[${i}].dow missing`);
    else if (w.dow.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      errors.push(`happy_hour_windows[${i}].dow must be 0-6`);
    if (!TIME_RE.test(w.start_time || ""))
      errors.push(`happy_hour_windows[${i}].start_time invalid`);
    if (!TIME_RE.test(w.end_time || ""))
      errors.push(`happy_hour_windows[${i}].end_time invalid`);
  });

  // Optional menu — only validate if present.
  const menu = draft?.menu;
  if (menu != null) {
    if (typeof menu !== 'object') {
      errors.push('menu must be an object if present');
    } else {
      const sections = Array.isArray(menu.sections) ? menu.sections : [];
      sections.forEach((s, si) => {
        if (typeof s?.name !== 'string' || !s.name.trim())
          errors.push(`menu.sections[${si}].name required`);
        const items = Array.isArray(s?.items) ? s.items : [];
        items.forEach((it, ii) => {
          if (typeof it?.name !== 'string' || !it.name.trim())
            errors.push(`menu.sections[${si}].items[${ii}].name required`);
          if (
            it?.price != null &&
            (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price < 0)
          )
            errors.push(`menu.sections[${si}].items[${ii}].price must be a non-negative number or null`);
        });
      });
    }
  }

  return errors;
}

// ─── 6. MAIN ────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.name && !args.url && !args.placeId)) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  if (!GOOGLE_API_KEY) {
    console.error("✗ GOOGLE_PLACES_API_KEY missing in env.");
    process.exit(1);
  }
  if (!ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY missing in env.");
    process.exit(1);
  }

  // 1. DISCOVER place_id
  let placeId = args.placeId;
  if (!placeId) {
    const q = args.name || args.url;
    console.error(`→ Discovering Place ID for "${q}"…`);
    placeId = await placesTextSearch(q);
  }

  // 2. PLACES details
  console.error(`→ Fetching Places details (${placeId})…`);
  const place = await placesDetails(placeId);
  const addr = unpackAddressComponents(place.address_components);

  // 3. SCRAPE website + linked happy hour pages
  const seedUrl = args.url || place.website;
  const scrapedTexts = [];
  if (seedUrl) {
    console.error(`→ Scraping ${seedUrl}…`);
    const homeText = await scrapeText(seedUrl);
    if (homeText) {
      scrapedTexts.push({ url: seedUrl, text: homeText });
      // try linked happy-hour / specials pages
      try {
        const homeHtmlRes = await fetchWithTimeout(seedUrl);
        const homeHtml = homeHtmlRes.ok ? await homeHtmlRes.text() : "";
        const links = discoverHappyHourLinks(homeHtml);
        for (const href of links) {
          const absolute = new URL(href, seedUrl).toString();
          if (scrapedTexts.some((s) => s.url === absolute)) continue;
          console.error(`  · also scraping ${absolute}`);
          const t = await scrapeText(absolute);
          if (t) scrapedTexts.push({ url: absolute, text: t });
          if (scrapedTexts.length >= 4) break;
        }
      } catch {
        /* link discovery is best-effort */
      }
    }
  }

  // 4. EXTRACT with Claude
  console.error(`→ Calling Claude (${MODEL})…`);
  const { parsed: draft, usage } = await callClaude({
    placesData: {
      name: place.name,
      formatted_address: place.formatted_address,
      address_components: addr,
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      phone: place.international_phone_number,
      website: place.website,
      rating: place.rating,
      user_ratings_total: place.user_ratings_total,
      price_level: place.price_level,
      types: place.types,
      business_status: place.business_status,
      editorial_summary: place.editorial_summary?.overview,
      opening_hours_weekday_text: place.opening_hours?.weekday_text,
    },
    scrapedTexts,
  });

  // Merge Places authoritative fields on top of Claude's draft.
  draft.venue = {
    ...(draft.venue || {}),
    name: draft.venue?.name || place.name,
    address:
      draft.venue?.address ||
      [addr.street_number, addr.route].filter(Boolean).join(" ") ||
      place.formatted_address,
    city: draft.venue?.city || addr.city,
    state: draft.venue?.state || addr.state,
    zip: draft.venue?.zip || addr.zip,
    phone: draft.venue?.phone || place.international_phone_number,
    website: draft.venue?.website || place.website,
    lat: place.geometry?.location?.lat,
    lng: place.geometry?.location?.lng,
    price_tier: draft.venue?.price_tier ?? place.price_level,
    google_place_id: place.place_id,
    google_rating: place.rating,
    google_review_count: place.user_ratings_total,
  };

  // 5. VALIDATE
  const errors = validateDraft(draft);

  const result = {
    source: { place_id: placeId, seed_url: seedUrl || null, scraped_pages: scrapedTexts.map((s) => s.url) },
    draft,
    validation: { errors, ok: errors.length === 0 },
    usage,
    generated_at: new Date().toISOString(),
    model: MODEL,
  };

  // 6. EMIT
  const json = JSON.stringify(result, null, 2);
  if (args.stdout) {
    process.stdout.write(json + "\n");
    return;
  }
  const outDir = resolve(__dirname, "intake-output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath =
    args.outPath || join(outDir, `${slugify(draft.venue?.name || args.name || placeId)}.json`);
  writeFileSync(outPath, json + "\n", "utf8");
  console.error(`✓ wrote ${outPath}`);
  if (errors.length) {
    console.error(`⚠ ${errors.length} validation issue(s):`);
    for (const e of errors) console.error(`   - ${e}`);
  }
  if (usage) {
    console.error(
      `· tokens: ${usage.input_tokens} in / ${usage.output_tokens} out`
    );
  }
}

main().catch((err) => {
  console.error("✗ intake failed:", err.message);
  process.exit(1);
});
