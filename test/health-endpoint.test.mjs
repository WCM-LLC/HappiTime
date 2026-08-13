// test/health-endpoint.test.mjs
//
// Guards the public /api/health endpoint an external uptime monitor polls.
//
// The endpoint exists because #158's GitHub Actions check runs on a ~50-minute
// real cadence (GitHub throttles `*/10` hard), which is too wide a blind window
// for a hang that serves cached 200s the whole time. An external pinger closes
// that gap — but only if the endpoint refuses to answer 200 when something is
// actually wrong. These tests pin exactly that.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const ROUTE = "apps/web/src/app/api/health/route.ts";

// The route is TypeScript, so mirror its verdict here and pin the source
// against it — the same approach the intake and uptime tests use.
const SLOW_MS = 5000;
const evaluateProbes = (probes) => {
  const failures = [];
  for (const p of probes) {
    if (!p.ok) {
      failures.push(p.error ? `${p.name}: no response (${p.error})` : `${p.name}: HTTP ${p.status}`);
    } else if (p.ms > SLOW_MS) {
      failures.push(`${p.name}: responded in ${p.ms}ms (over ${SLOW_MS}ms)`);
    }
  }
  return { healthy: failures.length === 0, failures };
};

test("a fast, answering pair of surfaces is healthy", () => {
  const v = evaluateProbes([
    { name: "postgrest", ok: true, status: 200, ms: 300 },
    { name: "gotrue", ok: true, status: 200, ms: 210 },
  ]);
  assert.equal(v.healthy, true);
  assert.deepEqual(v.failures, []);
});

test("a response that arrives but is over budget still fails", () => {
  // The 2026-08-12 lesson: during the incident every binary signal read
  // healthy. Latency is the only thing that would have caught it early, so a
  // slow-but-successful response must trip the alarm.
  const v = evaluateProbes([
    { name: "postgrest", ok: true, status: 200, ms: SLOW_MS + 1 },
    { name: "gotrue", ok: true, status: 200, ms: 200 },
  ]);
  assert.equal(v.healthy, false);
  assert.match(v.failures[0], /postgrest: responded in 5001ms/);
});

test("exactly at the budget is not yet a failure", () => {
  const v = evaluateProbes([{ name: "gotrue", ok: true, status: 200, ms: SLOW_MS }]);
  assert.equal(v.healthy, true);
});

test("a hang and an error status are reported differently", () => {
  const v = evaluateProbes([
    { name: "postgrest", ok: false, status: null, ms: 15000, error: "The operation was aborted" },
    { name: "gotrue", ok: false, status: 503, ms: 80 },
  ]);
  assert.equal(v.healthy, false);
  assert.match(v.failures[0], /postgrest: no response \(The operation was aborted\)/);
  assert.match(v.failures[1], /gotrue: HTTP 503/);
});

test("both monitors agree on what 'up' means", () => {
  // Two uptime checks disagreeing about the threshold is worse than one check.
  const route = read(ROUTE);
  const script = read("scripts/check-uptime.mjs");
  const routeSlow = /export const SLOW_MS = (\d+);/.exec(route)?.[1];
  const scriptSlow = /export const SLOW_MS = (\d+);/.exec(script)?.[1];
  assert.ok(routeSlow && scriptSlow, "both must declare SLOW_MS");
  assert.equal(routeSlow, scriptSlow, "SLOW_MS must match scripts/check-uptime.mjs");
});

test("the endpoint can never be served from cache", () => {
  // A cached 200 is the exact lie this endpoint exists to catch: during the
  // incident happitime.biz served 200s from Vercel's cache while Supabase
  // answered nothing.
  const route = read(ROUTE);
  assert.match(route, /export const dynamic = 'force-dynamic'/);
  assert.match(route, /export const revalidate = 0/);
  assert.match(route, /'cache-control': 'no-store'/);
  assert.match(route, /cache: 'no-store'/);
});

test("misconfiguration reports unhealthy rather than healthy", () => {
  // The mail outage failed this way: a missing key made every send a silent
  // no-op that looked like success. A monitor must never inherit that shape.
  const route = read(ROUTE);
  assert.match(route, /if \(!url \|\| !key\)/);
  assert.match(route, /misconfigured/);
  assert.doesNotMatch(
    route,
    /if \(!url \|\| !key\)[\s\S]{0,200}status: 200/,
    "a missing Supabase URL or key must not return 200",
  );
});

test("failure returns 503, not 200 with a false body", () => {
  const route = read(ROUTE);
  assert.match(route, /status: healthy \? 200 : 503/);
});

test("it probes both surfaces a login actually depends on", () => {
  const route = read(ROUTE);
  assert.match(route, /rest\/v1\/venues/, "PostgREST: the table every surface reads");
  assert.match(route, /auth\/v1\/settings/, "GoTrue: the call every login makes");
});
