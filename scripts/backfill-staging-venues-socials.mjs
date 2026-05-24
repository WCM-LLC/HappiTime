/**
 * scripts/backfill-staging-venues-socials.mjs
 *
 * Backfills social-link data from two finished Apify (compass/crawler-google-places)
 * runs into existing staging_venues rows, merging into the JSONB payload column.
 * Only rows with status = 'pending' are touched; new rows are never inserted.
 *
 * Usage (from repo root, with APIFY_TOKEN exported in your shell):
 *   node scripts/backfill-staging-venues-socials.mjs
 *
 * Reads from env / apps/web/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL  (or EXPO_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APIFY_TOKEN               (must be in shell env — not stored in .env files)
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
  } catch { /* file absent — skip */ }
}

loadEnvFile(resolve(ROOT, '.env'));
loadEnvFile(resolve(ROOT, 'apps/web/.env.local'));

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';

const missing = [];
if (!SUPABASE_URL)  missing.push('SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL');
if (!SERVICE_KEY)   missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!APIFY_TOKEN)   missing.push('APIFY_TOKEN (export it in your shell)');
if (missing.length) { console.error('✗  Missing:', missing.join('\n   ')); process.exit(1); }

// ─── config ──────────────────────────────────────────────────────────────────

const RUNS = [
  { name: 'Crossroads',       runId: 'lrbRM9PgTwzKax3YG' },
  { name: 'Greater Downtown', runId: 'PdTQAmNYqlVCrqFOj' },
];

const BATCH_SIZE = 25;
const APIFY_BASE = 'https://api.apify.com/v2';

// ─── Apify helpers ────────────────────────────────────────────────────────────

async function apifyGet(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${APIFY_BASE}${path}${sep}token=${APIFY_TOKEN}`);
  if (!res.ok) throw new Error(`Apify GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchRunItems(runId, districtName) {
  const runInfo = await apifyGet(`/actor-runs/${runId}`);
  const { status, defaultDatasetId } = runInfo.data ?? {};
  if (status !== 'SUCCEEDED') {
    throw new Error(`Run ${runId} (${districtName}) status is "${status}", expected SUCCEEDED`);
  }
  console.log(`  ✓ Run ${runId} SUCCEEDED — dataset ${defaultDatasetId}`);

  const itemsRes = await apifyGet(`/datasets/${defaultDatasetId}/items?clean=true&limit=10000`);
  const items = Array.isArray(itemsRes) ? itemsRes : (itemsRes.items ?? []);
  console.log(`  ✓ Fetched ${items.length} items from dataset`);
  return items;
}

// ─── patch builder ────────────────────────────────────────────────────────────

function buildPatch(item) {
  const socials = {
    instagram: item.instagrams  || [],
    facebook:  item.facebooks   || [],
    tiktok:    item.tiktoks     || [],
    twitter:   item.twitters    || [],
    youtube:   item.youtubes    || [],
    linkedin:  item.linkedIns   || [],
  };
  const emails        = item.emails   || [];
  const thumbnail_url = item.imageUrl ?? null;

  const hasSocials   = Object.values(socials).some(arr => arr.length > 0);
  const hasEmails    = emails.length > 0;
  const hasThumbnail = thumbnail_url !== null;

  if (!hasSocials && !hasEmails && !hasThumbnail) return null;

  return {
    instagram_url:  item.instagrams?.[0] ?? null,
    facebook_url:   item.facebooks?.[0]  ?? null,
    tiktok_url:     item.tiktoks?.[0]    ?? null,
    socials,
    emails,
    thumbnail_url,
  };
}

// ─── Supabase REST helpers ────────────────────────────────────────────────────

const SB_HEADERS = {
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function selectRows(placeIds) {
  const inList = placeIds.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
  const url =
    `${SUPABASE_URL}/rest/v1/staging_venues` +
    `?select=id,external_ref,payload` +
    `&external_ref=in.(${inList})` +
    `&status=eq.pending`;
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`SELECT failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function patchRow(id, mergedPayload) {
  const url = `${SUPABASE_URL}/rest/v1/staging_venues?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ payload: mergedPayload }),
  });
  if (!res.ok) throw new Error(`PATCH id=${id} failed ${res.status}: ${await res.text()}`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function processDistrict(districtName, items) {
  // Build placeId → patch map; skip items with no placeId or nothing to write
  const patchMap = new Map();
  for (const item of items) {
    const placeId = item.placeId;
    if (!placeId) continue;
    const patch = buildPatch(item);
    if (!patch) continue;
    patchMap.set(placeId, patch);
  }

  console.log(`\n  ${patchMap.size} items have social/email/thumbnail data`);

  const placeIds   = [...patchMap.keys()];
  let rowsMatched  = 0;
  let rowsUpdated  = 0;
  let rowsWithSocials = 0;

  for (let i = 0; i < placeIds.length; i += BATCH_SIZE) {
    const batchIds = placeIds.slice(i, i + BATCH_SIZE);

    // SELECT existing rows for this batch
    const rows = await selectRows(batchIds);
    rowsMatched += rows.length;

    // Merge and PATCH each matched row
    await Promise.all(rows.map(async row => {
      const patch = patchMap.get(row.external_ref);
      if (!patch) return;

      const existingPayload = row.payload ?? {};
      const mergedPayload   = { ...existingPayload, ...patch };

      await patchRow(row.id, mergedPayload);
      rowsUpdated++;

      const hasSocials = Object.values(patch.socials ?? {}).some(a => a.length > 0);
      if (hasSocials) rowsWithSocials++;
    }));

    process.stdout.write(
      `\r  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(placeIds.length / BATCH_SIZE)}` +
      ` — matched ${rowsMatched}, updated ${rowsUpdated}`
    );
  }

  console.log(); // newline after progress
  return { rowsMatched, rowsUpdated, rowsWithSocials };
}

async function main() {
  console.log('Backfilling staging_venues social links from Apify runs\n');

  const totals = { rowsMatched: 0, rowsUpdated: 0, rowsWithSocials: 0 };

  for (const { name, runId } of RUNS) {
    console.log(`\n── ${name} (${runId}) ──`);
    const items = await fetchRunItems(runId, name);
    const stats = await processDistrict(name, items);

    console.log(
      `  Rows matched: ${stats.rowsMatched} | Updated: ${stats.rowsUpdated}` +
      ` | With ≥1 social: ${stats.rowsWithSocials}`
    );
    totals.rowsMatched   += stats.rowsMatched;
    totals.rowsUpdated   += stats.rowsUpdated;
    totals.rowsWithSocials += stats.rowsWithSocials;
  }

  console.log('\n── Summary ──────────────────────────────────');
  console.log(`  Total rows matched : ${totals.rowsMatched}`);
  console.log(`  Total rows updated : ${totals.rowsUpdated}`);
  console.log(`  Rows with ≥1 social: ${totals.rowsWithSocials}`);
  console.log('Done.');
}

main().catch(err => { console.error('\n✗', err.message); process.exit(1); });
