/**
 * mobile-ota-config.test.mjs
 *
 * Guards the OTA re-enablement invariants (see docs/ota-runbook.md).
 *
 * History: OTA was disabled in PR #103 after prod crashes during update
 * activation; the crash class turned out to be update bundles exported
 * without EXPO_PUBLIC_* env (eas update ignores eas.json build-profile env),
 * not an expo-updates native bug. Re-enabling relies on: default update
 * flags in app.json, explicit EAS environments on both build profiles, and
 * a preview channel to device-verify updates before production.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const readJson = (rel) => JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));

const appJson = readJson("apps/mobile/app.json");
const easJson = readJson("apps/mobile/eas.json");

test("app.json updates block is back to defaults (enabled, ON_LOAD)", () => {
  const updates = appJson.expo.updates;
  assert.ok(updates?.url, "updates.url must stay set");
  // The PR #103 kill-switches must not silently return — disabling OTA is a
  // deliberate incident response, not a leftover.
  assert.equal(updates.enabled, undefined, "updates.enabled override found");
  assert.equal(updates.checkAutomatically, undefined, "checkAutomatically override found");
});

test("update routing assumptions hold", () => {
  // The runbook's curl verification and promote flow assume appVersion policy.
  assert.equal(appJson.expo.runtimeVersion?.policy, "appVersion");
});

test("build profiles pin channel + EAS environment", () => {
  const { preview, production } = easJson.build;
  // preview: internal build on its own channel so updates can be
  // device-verified before touching store users…
  assert.equal(preview.channel, "preview");
  // …but with the production EAS env, so the bundle matches what prod ships.
  assert.equal(preview.environment, "production");
  assert.equal(production.channel, "production");
  // Explicit environment keeps builds and `eas update --environment
  // production` sourcing env from the same place.
  assert.equal(production.environment, "production");
});

test("the OTA runbook exists and demands --environment production", () => {
  const path = join(repoRoot, "docs/ota-runbook.md");
  assert.ok(existsSync(path), "docs/ota-runbook.md missing");
  const runbook = readFileSync(path, "utf8");
  assert.match(runbook, /--environment production/);
  assert.match(runbook, /--branch master/, "must document the channel→master trap");
});

test("no stale nested lockfile can pin old mobile deps", () => {
  // The workspace root package-lock.json is authoritative; a nested one in
  // apps/mobile once sat at expo-updates 29.0.15 while npm installed 29.0.19.
  assert.ok(!existsSync(join(repoRoot, "apps/mobile/package-lock.json")));
});
