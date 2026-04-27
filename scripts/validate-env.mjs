#!/usr/bin/env node
/**
 * validate-env.mjs
 *
 * Reads each app's .env.example, checks that every non-commented key has a
 * value in the matching .env.local (or process.env in CI). Exits non-zero if
 * any required key is missing. Commented keys (lines starting with #) and
 * blank lines are ignored.
 *
 * Usage: node scripts/validate-env.mjs
 * CI: set env vars in the environment; .env.local is optional.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const ALL_APPS = [
  { name: "apps/web", example: "apps/web/.env.example", local: "apps/web/.env.local" },
  { name: "apps/mobile", example: "apps/mobile/.env.example", local: "apps/mobile/.env" },
  { name: "apps/directory", example: "apps/directory/.env.example", local: "apps/directory/.env.local" },
];

// Optional positional args: filter to specific app names (e.g. "apps/web")
const appFilter = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPS = appFilter.length > 0
  ? ALL_APPS.filter((a) => appFilter.includes(a.name))
  : ALL_APPS;

/** Parse key=value pairs from a .env file, returning a Map<key, value>. */
function parseEnvFile(filePath) {
  const map = new Map();
  if (!existsSync(filePath)) return map;
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

/** Extract required key names from a .env.example file.
 *  Keys are required if the line is not commented and the value is empty.
 *  Keys with a default value (non-empty right-hand side) are treated as optional.
 */
function parseExampleKeys(filePath) {
  const required = [];
  const optional = [];
  if (!existsSync(filePath)) return { required, optional };
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!key) continue;
    if (value === "") {
      required.push(key);
    } else {
      optional.push(key);
    }
  }
  return { required, optional };
}

let hasError = false;

for (const app of APPS) {
  const examplePath = resolve(ROOT, app.example);
  const localPath = resolve(ROOT, app.local);

  if (!existsSync(examplePath)) {
    console.warn(`[validate-env] WARN: missing ${app.example} — skipping`);
    continue;
  }

  const { required } = parseExampleKeys(examplePath);
  const localVars = parseEnvFile(localPath);

  const missing = [];
  for (const key of required) {
    const envValue = process.env[key] ?? localVars.get(key);
    if (!envValue || envValue.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(`\n[validate-env] MISSING keys in ${app.name}:`);
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
    console.error(`  → Copy ${app.example} → ${app.local} and fill in the blanks.\n`);
    hasError = true;
  } else {
    console.log(`[validate-env] OK  ${app.name} (${required.length} required key${required.length !== 1 ? "s" : ""} present)`);
  }
}

if (hasError) {
  process.exit(1);
}
