#!/usr/bin/env node
/**
 * Fetch Google Places photos for all venues missing media.
 * Run from the project root:
 *   node scripts/fetch-venue-photos.mjs
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, GOOGLE_PLACES_API_KEY
 * in .env or environment.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually
const envPath = resolve(process.cwd(), ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !PLACES_KEY) {
  console.error("Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_PLACES_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

async function downloadPhoto(photoRef, maxWidth = 800) {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoRef}&key=${PLACES_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Photo download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  // Get all published venues
  const { data: venues, error } = await supabase
    .from("venues")
    .select("id, name, address, city")
    .eq("status", "published")
    .order("name");

  if (error) { console.error("DB error:", error.message); return; }

  // Find which ones already have media
  const { data: mediaRows } = await supabase.from("venue_media").select("venue_id");
  const withMedia = new Set((mediaRows || []).map((m) => m.venue_id));
  const needPhotos = venues.filter((v) => !withMedia.has(v.id));

  console.log(`${venues.length} total venues, ${needPhotos.length} need photos\n`);

  let ok = 0, fail = 0;

  for (const venue of needPhotos) {
    const idx = `[${ok + fail + 1}/${needPhotos.length}]`;
    process.stdout.write(`${idx} ${venue.name}... `);

    try {
      const place = await searchPlace(venue.name, `${venue.address} ${venue.city}`);
      if (!place?.place_id) { console.log("no match"); fail++; continue; }

      const photos = await getPlacePhotos(place.place_id);
      if (photos.length === 0) { console.log("no photos"); fail++; continue; }

      const batch = photos.slice(0, 6);
      let uploaded = 0;

      for (let i = 0; i < batch.length; i++) {
        const ref = batch[i].photo_reference;
        const data = await downloadPhoto(ref);
        const path = `places/${venue.id}/${ref.substring(0, 120)}.jpg`;

        const { error: upErr } = await supabase.storage
          .from("venue-media")
          .upload(path, data, { contentType: "image/jpeg", upsert: true });

        if (upErr) { console.error(`\n  upload err: ${upErr.message}`); continue; }

        const { error: dbErr } = await supabase.from("venue_media").insert({
          venue_id: venue.id,
          type: "image",
          title: "Google Places",
          storage_path: path,
          sort_order: i,
          status: "published",
        });

        if (dbErr) { console.error(`\n  db err: ${dbErr.message}`); continue; }
        uploaded++;
        await new Promise((r) => setTimeout(r, 150));
      }

      console.log(`${uploaded} photos`);
      if (uploaded > 0) ok++; else fail++;
    } catch (err) {
      console.log(`error: ${err.message}`);
      fail++;
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nDone! ${ok} venues got photos, ${fail} failed/skipped`);
}

main().catch(console.error);
