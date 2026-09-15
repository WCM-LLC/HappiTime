#!/usr/bin/env node
/**
 * scripts/verify-ota-bundle.mjs
 *
 * Checks an exported EAS Update bundle BEFORE it is promoted to production.
 *
 * Why: both OTA outages (2026-06-08, 2026-07-01) shipped a bundle exported
 * without the EXPO_PUBLIC_* env inlined, so the app threw at boot. This
 * script is the mechanical version of runbook step 3.
 *
 * Hermes gotcha (2026-09-14): Hermes bytecode stores any string containing a
 * non-ASCII character as UTF-16LE, and pure-ASCII strings as UTF-8. A plain
 * `grep` for copy with an em dash or curly quote therefore returns 0 even
 * when the string is present. This script searches both encodings.
 *
 * Usage (from apps/mobile, after `eas update` has written dist/):
 *   node ../../scripts/verify-ota-bundle.mjs
 *   node ../../scripts/verify-ota-bundle.mjs --expect "Nothing on today — try This Week." --absent 'label:"All"'
 *   node ../../scripts/verify-ota-bundle.mjs --dist /path/to/dist
 *
 * Exit 1 if any REQUIRED marker is missing from any platform bundle, or any
 * --absent string is found. --expect strings are reported but only fail the
 * run when --strict is passed.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// Markers every production bundle must carry — the inlined EXPO_PUBLIC_* env.
// If code starts reading a new EXPO_PUBLIC_* var, add its recognisable value here.
const REQUIRED = [
  { label: "EXPO_PUBLIC_SUPABASE_URL", needle: "ujflcrjsiyhofnomurco.supabase.co" },
  { label: "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", needle: "sb_publishable_" },
];

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const multi = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const strict = args.includes("--strict");
const distDir = resolve(opt("--dist") ?? join(process.cwd(), "dist"));

if (!existsSync(distDir)) {
  console.error(`dist not found: ${distDir}\nRun from apps/mobile after an export, or pass --dist.`);
  process.exit(2);
}

function findBundles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findBundles(p, out);
    else if (/\.(hbc|js)$/.test(name) && !name.endsWith(".map")) out.push(p);
  }
  return out;
}

function count(buf, s) {
  const u8 = Buffer.from(s, "utf8");
  const u16 = Buffer.from(s, "utf16le");
  let n = 0, i = -1;
  while ((i = buf.indexOf(u8, i + 1)) !== -1) n++;
  let m = 0; i = -1;
  while ((i = buf.indexOf(u16, i + 1)) !== -1) m++;
  return { utf8: n, utf16: m, total: n + m };
}

const bundles = findBundles(distDir).filter((p) => /\/(ios|android)\//.test(p));
if (bundles.length === 0) {
  console.error(`no ios/android bundles under ${distDir}`);
  process.exit(2);
}

let failed = false;
for (const b of bundles) {
  const buf = readFileSync(b);
  const platform = /\/ios\//.test(b) ? "ios" : "android";
  console.log(`\n${platform}  ${b.replace(distDir + "/", "")}  (${(buf.length / 1048576).toFixed(1)} MB)`);

  for (const { label, needle } of REQUIRED) {
    const c = count(buf, needle);
    const ok = c.total > 0;
    if (!ok) failed = true;
    console.log(`  ${ok ? "✔" : "✘"} required  ${label.padEnd(38)} ${needle}  [utf8=${c.utf8} utf16=${c.utf16}]`);
  }
  for (const s of multi("--expect")) {
    const c = count(buf, s);
    const ok = c.total > 0;
    if (!ok && strict) failed = true;
    console.log(`  ${ok ? "✔" : (strict ? "✘" : "○")} expect    ${JSON.stringify(s)}  [utf8=${c.utf8} utf16=${c.utf16}]`);
  }
  for (const s of multi("--absent")) {
    const c = count(buf, s);
    const ok = c.total === 0;
    if (!ok) failed = true;
    console.log(`  ${ok ? "✔" : "✘"} absent    ${JSON.stringify(s)}  [utf8=${c.utf8} utf16=${c.utf16}]`);
  }
}

console.log(failed ? "\nFAILED — do not promote this bundle." : "\nOK — bundle carries the inlined env.");
process.exit(failed ? 1 : 0);
