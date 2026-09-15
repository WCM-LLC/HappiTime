// test/verify-ota-bundle.test.mjs
//
// Locks the Hermes encoding behaviour scripts/verify-ota-bundle.mjs exists
// for: strings with non-ASCII characters are stored UTF-16LE in .hbc, pure
// ASCII as UTF-8. A verifier that only greps UTF-8 misses the former.
//
// Run: node --test test/verify-ota-bundle.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/verify-ota-bundle.mjs", import.meta.url));

function makeDist(bundleParts) {
  const dist = mkdtempSync(join(tmpdir(), "ota-verify-"));
  for (const platform of ["ios", "android"]) {
    const dir = join(dist, "_expo", "static", "js", platform);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index-abc.hbc"), Buffer.concat(bundleParts));
  }
  return dist;
}

const run = (dist, ...extra) =>
  spawnSync(process.execPath, [SCRIPT, "--dist", dist, ...extra], { encoding: "utf8" });

test("passes when the inlined env is present (ASCII, utf8)", () => {
  const dist = makeDist([
    Buffer.from("junk https://ujflcrjsiyhofnomurco.supabase.co more sb_publishable_abc", "utf8"),
  ]);
  const r = run(dist);
  rmSync(dist, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /OK — bundle carries the inlined env/);
});

test("fails when the env is missing — the outage class", () => {
  const dist = makeDist([Buffer.from("no env here at all", "utf8")]);
  const r = run(dist);
  rmSync(dist, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✘ required/);
  assert.match(r.stdout, /FAILED/);
});

test("finds copy stored as UTF-16LE (Hermes non-ASCII strings) via --expect --strict", () => {
  const copy = "Nothing on today — try This Week.";
  const dist = makeDist([
    Buffer.from("https://ujflcrjsiyhofnomurco.supabase.co sb_publishable_x ", "utf8"),
    Buffer.from(copy, "utf16le"), // exactly how Hermes stores it
  ]);
  const r = run(dist, "--expect", copy, "--strict");
  rmSync(dist, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /utf8=0 utf16=1/);
});

test("--absent fails the run when the string is still in the bundle", () => {
  const dist = makeDist([
    Buffer.from('https://ujflcrjsiyhofnomurco.supabase.co sb_publishable_x label:"All"', "utf8"),
  ]);
  const r = run(dist, "--absent", 'label:"All"');
  rmSync(dist, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✘ absent/);
});
