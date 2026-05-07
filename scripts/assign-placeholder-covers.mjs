#!/usr/bin/env node
/**
 * scripts/assign-placeholder-covers.mjs
 *
 * Assigns generated SVG placeholder cover images to venues that have no
 * venue_media records. No external API required — works fully offline.
 *
 * Each placeholder is a branded SVG with a category icon, gradient background,
 * and the venue name overlaid.
 *
 * Usage:
 *   node scripts/assign-placeholder-covers.mjs
 *   node scripts/assign-placeholder-covers.mjs --dry-run
 *
 * Required env vars:
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

const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL
  || process.env.EXPO_PUBLIC_SUPABASE_URL
  || 'https://ujflcrjsiyhofnomurco.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.');
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Category definitions ────────────────────────────────────────────────────

/**
 * Each category has a gradient, an emoji-style icon (SVG path), and a label.
 * We match venues to categories by cuisine_type and tags.
 */
const CATEGORIES = {
  mexican: {
    label: 'Mexican',
    gradient: ['#E65100', '#FF8F00'],
    // Taco icon
    icon: 'M60,55 Q80,25 100,55 L100,65 Q80,50 60,65 Z',
  },
  italian: {
    label: 'Italian',
    gradient: ['#B71C1C', '#E53935'],
    // Pizza slice
    icon: 'M80,30 L60,70 L100,70 Z M75,48 A3,3 0 1,0 78,48 A3,3 0 1,0 75,48 M85,55 A3,3 0 1,0 88,55 A3,3 0 1,0 85,55',
  },
  asian: {
    label: 'Asian',
    gradient: ['#880E4F', '#E91E63'],
    // Bowl with chopsticks
    icon: 'M60,55 Q80,75 100,55 L100,58 Q80,78 60,58 Z M70,35 L75,55 M90,35 L85,55',
  },
  japanese: {
    label: 'Japanese',
    gradient: ['#1A237E', '#3F51B5'],
    // Sushi roll
    icon: 'M65,45 A15,15 0 1,1 95,45 A15,15 0 1,1 65,45 M72,45 A8,8 0 1,1 88,45 A8,8 0 1,1 72,45',
  },
  american: {
    label: 'American',
    gradient: ['#1B5E20', '#4CAF50'],
    // Burger
    icon: 'M60,42 Q80,30 100,42 L100,46 L60,46 Z M58,50 L102,50 L102,54 L58,54 Z M60,58 Q80,70 100,58 L100,62 Q80,74 60,62 Z',
  },
  brewery: {
    label: 'Brewery',
    gradient: ['#E65100', '#FFA000'],
    // Beer mug
    icon: 'M65,35 L65,70 L90,70 L90,35 Z M90,42 L100,42 L100,58 L90,58 M70,40 L70,50 M77,40 L77,50 M84,40 L84,50',
  },
  cocktail: {
    label: 'Cocktail Bar',
    gradient: ['#4A148C', '#9C27B0'],
    // Martini glass
    icon: 'M65,35 L80,55 L95,35 Z M80,55 L80,70 M72,70 L88,70',
  },
  wine: {
    label: 'Wine Bar',
    gradient: ['#4E342E', '#8D6E63'],
    // Wine glass
    icon: 'M73,35 L73,48 Q73,58 80,58 Q87,58 87,48 L87,35 Z M80,58 L80,70 M73,70 L87,70',
  },
  sports: {
    label: 'Sports Bar',
    gradient: ['#0D47A1', '#2196F3'],
    // Football
    icon: 'M65,50 Q80,35 95,50 Q80,65 65,50 Z M75,45 L85,55 M75,55 L85,45',
  },
  seafood: {
    label: 'Seafood',
    gradient: ['#006064', '#00ACC1'],
    // Fish
    icon: 'M60,50 Q75,35 95,50 Q75,65 60,50 Z M88,47 A2,2 0 1,0 90,47 A2,2 0 1,0 88,47 M55,42 L60,50 L55,58',
  },
  default: {
    label: 'Happy Hour',
    gradient: ['#FF6F00', '#FFB300'],
    // Clock / happy hour
    icon: 'M65,50 A15,15 0 1,1 95,50 A15,15 0 1,1 65,50 M80,42 L80,50 L88,50',
  },
};

/**
 * Match a venue to a category key based on cuisine_type and tags.
 */
function categorizeVenue(venue) {
  const cuisine = (venue.cuisine_type || '').toLowerCase();
  const tags = (venue.tags || []).map((t) => t.toLowerCase());

  // Direct cuisine match
  if (cuisine && CATEGORIES[cuisine]) return cuisine;

  // Fuzzy cuisine mapping
  const cuisineMap = {
    chinese: 'asian',
    thai: 'asian',
    korean: 'asian',
    vietnamese: 'asian',
    indian: 'asian',
    sushi: 'japanese',
    ramen: 'japanese',
    pizza: 'italian',
    pasta: 'italian',
    burger: 'american',
    bbq: 'american',
    barbecue: 'american',
    tacos: 'mexican',
    tex_mex: 'mexican',
    'tex-mex': 'mexican',
    fish: 'seafood',
  };
  if (cuisine && cuisineMap[cuisine]) return cuisineMap[cuisine];

  // Tag-based detection
  for (const tag of tags) {
    if (tag.includes('brewery') || tag.includes('taproom')) return 'brewery';
    if (tag.includes('cocktail') || tag.includes('lounge')) return 'cocktail';
    if (tag.includes('wine')) return 'wine';
    if (tag.includes('sports')) return 'sports';
    if (tag.includes('dive bar') || tag.includes('pub')) return 'brewery';
  }

  return 'default';
}

/**
 * Generate an SVG placeholder image for a venue.
 * Returns the SVG as a UTF-8 string.
 */
function generatePlaceholderSvg(venue, category) {
  const cat = CATEGORIES[category] || CATEGORIES.default;
  const [colorA, colorB] = cat.gradient;
  const venueName = escapeXml(venue.name || 'Venue');
  // Truncate long names
  const displayName = venueName.length > 30
    ? venueName.slice(0, 28) + '...'
    : venueName;
  const cityState = escapeXml(
    [venue.city, venue.state].filter(Boolean).join(', ') || ''
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${colorA}" />
      <stop offset="100%" stop-color="${colorB}" />
    </linearGradient>
    <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.5)" />
    </linearGradient>
  </defs>

  <!-- Background gradient -->
  <rect width="800" height="450" fill="url(#bg)" rx="0" />

  <!-- Decorative pattern -->
  <g opacity="0.08" fill="white">
    ${generatePatternDots()}
  </g>

  <!-- Category icon (centered, large) -->
  <g transform="translate(320, 80) scale(2.5)" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
    <path d="${cat.icon}" />
  </g>

  <!-- Dark overlay at bottom for text -->
  <rect y="280" width="800" height="170" fill="url(#overlay)" />

  <!-- Category label -->
  <text x="400" y="340" text-anchor="middle" fill="rgba(255,255,255,0.7)"
        font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="500"
        letter-spacing="2">
    ${cat.label.toUpperCase()}
  </text>

  <!-- Venue name -->
  <text x="400" y="380" text-anchor="middle" fill="white"
        font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700">
    ${displayName}
  </text>

  <!-- City / State -->
  <text x="400" y="410" text-anchor="middle" fill="rgba(255,255,255,0.6)"
        font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="400">
    ${cityState}
  </text>

  <!-- HappiTime watermark -->
  <text x="780" y="440" text-anchor="end" fill="rgba(255,255,255,0.25)"
        font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="400">
    HappiTime
  </text>
</svg>`;
}

function generatePatternDots() {
  const dots = [];
  for (let x = 40; x < 800; x += 60) {
    for (let y = 30; y < 280; y += 60) {
      // Offset every other row
      const offsetX = (Math.floor(y / 60) % 2) * 30;
      dots.push(`<circle cx="${x + offsetX}" cy="${y}" r="3" />`);
    }
  }
  return dots.join('\n    ');
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('============================================');
  console.log('  HappiTime — Placeholder Cover Generator');
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

  // 3. Generate and upload placeholders
  let success = 0;
  let failed = 0;
  const categoryCounts = {};

  for (let i = 0; i < needCovers.length; i++) {
    const venue = needCovers[i];
    const category = categorizeVenue(venue);
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    const label = `${venue.name} (${venue.city || '?'}, ${venue.state || '?'})`;
    console.log(`  [${i + 1}/${needCovers.length}] ${label}`);
    console.log(`    category: ${category} | cuisine: ${venue.cuisine_type || 'none'} | tags: ${(venue.tags || []).join(', ') || 'none'}`);

    if (DRY_RUN) {
      console.log(`    -> [DRY RUN] Would generate ${category} placeholder.`);
      success++;
      continue;
    }

    try {
      // Generate SVG
      const svg = generatePlaceholderSvg(venue, category);
      const svgBuffer = new TextEncoder().encode(svg);

      // Upload to Supabase Storage
      const storagePath = `covers/${venue.id}/cover.svg`;
      const { error: uploadErr } = await supabase.storage
        .from('venue-media')
        .upload(storagePath, svgBuffer, {
          contentType: 'image/svg+xml',
          upsert: true,
        });

      if (uploadErr) {
        console.error(`    -> Upload error: ${uploadErr.message}`);
        failed++;
        continue;
      }

      // Create venue_media record
      const { error: dbErr } = await supabase.from('venue_media').insert({
        venue_id: venue.id,
        type: 'image',
        title: `Placeholder (${CATEGORIES[category]?.label || 'Default'})`,
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

      console.log('    -> Uploaded placeholder.');
      success++;
    } catch (err) {
      console.error(`    -> Error: ${err.message}`);
      failed++;
    }
  }

  // 4. Summary
  console.log('\n============================================');
  console.log('  Results');
  console.log(`  Success  : ${success}`);
  console.log(`  Failed   : ${failed}`);
  console.log('');
  console.log('  Category breakdown:');
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    const catLabel = CATEGORIES[cat]?.label || cat;
    console.log(`    ${catLabel.padEnd(18)} ${count}`);
  }
  console.log('============================================');
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
