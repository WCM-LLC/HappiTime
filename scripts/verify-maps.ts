// TEMP: verification helper; safe to delete after maps validation is complete.
import { readFileSync } from "fs";
import { resolve } from "path";
import { geocodeAddress, reverseGeocode } from "../apps/web/src/services/maps";

const loadEnvFile = (relativePath: string) => {
  const filePath = resolve(process.cwd(), relativePath);
  let contents = "";
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!key || process.env[key]) continue;
    process.env[key] = value;
  }
};

const assertEnv = (key: string) => {
  if (process.env[key]) return;
  throw new Error(`${key} is missing`);
};

const run = async () => {
  loadEnvFile("apps/web/.env.local");
  loadEnvFile("apps/mobile/.env");

  assertEnv("NEXT_PUBLIC_MAPS_PROVIDER");
  assertEnv("NEXT_PUBLIC_MAPS_API_KEY");
  assertEnv("EXPO_PUBLIC_MAPS_API_KEY");

  const geo = await geocodeAddress("Seattle, WA");
  console.log("geocodeAddress:", geo);

  const reverse = await reverseGeocode({ lat: 47.6062, lng: -122.3321 });
  console.log("reverseGeocode:", reverse);

  const apiKey = process.env.EXPO_PUBLIC_MAPS_API_KEY ?? "";
  const params = new URLSearchParams({
    center: "47.6062,-122.3321",
    zoom: "12",
    size: "640x240",
    scale: "2",
    maptype: "roadmap",
    key: apiKey
  });
  params.append("markers", "color:0x1f2937|label:U|47.6062,-122.3321");

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
  );
  console.log("static map status:", response.status);
  console.log("static map content-type:", response.headers.get("content-type"));
  if (!response.ok) {
    throw new Error(`Static map request failed (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  console.log("static map bytes:", buffer.byteLength);
};

run().catch((err) => {
  console.error("verify-maps failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
