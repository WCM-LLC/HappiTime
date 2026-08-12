// test/uptime-check.test.mjs
//
// Guards the uptime tripwire built after the 2026-08-12 outage.
//
// That day PostgREST and GoTrue both hung for ~30 minutes: TLS completed in
// 0.12s, then nothing came back. Meanwhile happitime.biz served 200s from
// Vercel's cache and the project reported ACTIVE_HEALTHY. Every signal we had
// said fine. We learned it was down because someone tried to log in.
//
// So the checks below encode what "up" has to mean: answered, with a status,
// inside a latency budget.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluateUptime, SLOW_MS, ATTEMPTS } from "../scripts/check-uptime.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, "..", rel), "utf8");

const ok = (name, ms) => ({ name, ok: true, status: 200, ms });

test("healthy surfaces pass", () => {
  const { healthy, message } = evaluateUptime([ok("postgrest", 307), ok("gotrue", 252)]);
  assert.equal(healthy, true);
  assert.match(message, /OK: postgrest 307ms/);
});

test("a hung surface trips, and says so as 'no response'", () => {
  // The actual incident shape: no status at all, not a 500.
  const { healthy, message } = evaluateUptime([
    { name: "postgrest", ok: false, status: 0, ms: 15000, error: "no response in 15000ms" },
    ok("gotrue", 250),
  ]);
  assert.equal(healthy, false);
  assert.match(message, /postgrest: no response/);
  assert.match(message, /status\.supabase\.com/, "the alert must say where to look first");
});

test("a slow-but-alive surface still trips", () => {
  // The trap being closed: a request that eventually answers is not healthy.
  // Without this, a database crawling toward death reads as fine.
  const { healthy, message } = evaluateUptime([ok("postgrest", SLOW_MS + 1), ok("gotrue", 200)]);
  assert.equal(healthy, false);
  assert.match(message, new RegExp(`over ${SLOW_MS}ms`));
});

test("an HTTP error trips with its status", () => {
  const { healthy, message } = evaluateUptime([
    { name: "gotrue", ok: false, status: 503, ms: 120 },
    ok("postgrest", 300),
  ]);
  assert.equal(healthy, false);
  assert.match(message, /gotrue: HTTP 503/);
});

test("both surfaces are named when both are down", () => {
  const { message } = evaluateUptime([
    { name: "postgrest", ok: false, status: 0, ms: 15000, error: "no response in 15000ms" },
    { name: "gotrue", ok: false, status: 0, ms: 15000, error: "no response in 15000ms" },
  ]);
  assert.match(message, /postgrest/);
  assert.match(message, /gotrue/);
});

test("it retries before crying wolf", () => {
  // A scheduled alert that fires on single blips gets muted, and a muted
  // alert is exactly what this file exists to prevent.
  assert.ok(ATTEMPTS >= 2, "a single failed request must not trip the alarm");
});

test("it probes the two surfaces that actually went dark", () => {
  const script = read("scripts/check-uptime.mjs");
  // A real table read exercises PostgREST, Postgres and RLS together.
  assert.match(script, /rest\/v1\/venues\?select=id&limit=1/);
  // What every login reads before it can render.
  assert.match(script, /auth\/v1\/settings/);
  // Importable without executing, like check-auth-health.mjs.
  assert.match(script, /const isCli = process\.argv\[1\]/);
});

test("the workflow runs off-machine and handles secrets safely", () => {
  const wf = read(".github/workflows/uptime.yml");
  assert.match(wf, /schedule:/, "a laptop watchdog dies silently — this must be scheduled");
  assert.match(wf, /workflow_dispatch:/);
  // Secrets reach the script through env, never interpolated into run:.
  assert.match(wf, /SUPABASE_ANON_KEY: \$\{\{ secrets\.SUPABASE_ANON_KEY \}\}/);
  assert.doesNotMatch(wf, /run:[^\n]*\$\{\{ secrets\./);
  assert.match(wf, /concurrency:/, "queued-up checks help nobody");
});
