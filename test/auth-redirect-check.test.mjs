// test/auth-redirect-check.test.mjs
//
// Guards the GoTrue redirect allow-list check.
//
// This exists because the question "can people log in at console.happitime.biz?"
// is unanswerable from outside the project. GoTrue does not validate
// `redirect_to` at /authorize — verified 2026-08-13, a deliberately bogus
// domain passed through the Location header identically to a real one — so the
// config has to be read directly.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateRedirects, EXPECTED_HOSTS, hostOf } from "../scripts/check-auth-redirects.mjs";

const FULL = [
  "https://happitime-console.vercel.app/**",
  "https://console.happitime.biz/**",
  "https://happitime.biz/**",
  "happitime://auth/callback",
];

test("a complete allow-list passes", () => {
  const v = evaluateRedirects(FULL, "https://happitime-console.vercel.app");
  assert.equal(v.healthy, true);
  assert.match(v.message, /All required redirect hosts are allow-listed/);
});

test("a missing branded console domain fails, and says why", () => {
  // The specific condition this was built to detect.
  const v = evaluateRedirects(FULL.filter((e) => !e.includes("console.happitime.biz")), "x");
  assert.equal(v.healthy, false);
  assert.match(v.message, /console\.happitime\.biz/);
  assert.match(v.message, /resolveConsoleOrigin falls back to the request host/);
});

test("a missing vercel.app console host also fails", () => {
  // It is the documented fallback in auth-redirects.ts, email.ts and both
  // .env.example files, so losing it breaks logins even if the brand domain works.
  const v = evaluateRedirects(FULL.filter((e) => !e.includes("happitime-console.vercel.app")), "x");
  assert.equal(v.healthy, false);
  assert.match(v.message, /happitime-console\.vercel\.app/);
});

test("the optional directory host does not fail the run", () => {
  const v = evaluateRedirects(
    ["https://console.happitime.biz/**", "https://happitime-console.vercel.app/**"],
    "x",
  );
  assert.equal(v.healthy, true, "happitime.biz is informational, not required");
  const dir = v.results.find((r) => r.host === "happitime.biz");
  assert.equal(dir.present, false);
  assert.equal(dir.required, false);
});

test("an empty or absent allow-list is a failure, not a pass", () => {
  // The dangerous default: treating "no config returned" as "nothing missing".
  for (const input of [[], null, undefined, [""], ["   "]]) {
    const v = evaluateRedirects(input, "x");
    assert.equal(v.healthy, false, `empty input ${JSON.stringify(input)} must fail`);
  }
});

test("matching is case-insensitive and tolerant of surrounding syntax", () => {
  const v = evaluateRedirects(
    ["  HTTPS://Console.HappiTime.BIZ/**  ", "https://HAPPITIME-console.vercel.app/*"],
    "x",
  );
  assert.equal(v.healthy, true);
});

test("every expected host explains itself", () => {
  // A failure message naming a host without saying why it matters sends the
  // reader to the dashboard with no idea what to add or whether to care.
  for (const e of EXPECTED_HOSTS) {
    assert.ok(e.host && e.host.length > 0);
    assert.ok(e.why && e.why.length > 20, `${e.host} needs a real explanation`);
    assert.equal(typeof e.required, "boolean");
  }
});

test("the workflow is dispatch-only and never scheduled", () => {
  // Redirect config changes only on deliberate action. A schedule here would
  // be pure noise, and noisy checks get ignored — which is how the digest
  // alarm went unnoticed.
  const wf = readFileSync(new URL("../.github/workflows/auth-config-check.yml", import.meta.url), "utf8");
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /^\s*schedule:/m, "must not run on a schedule");
  assert.doesNotMatch(wf, /cron:/, "must not carry a cron expression");
});

test("the script cannot run without credentials and says so distinctly", () => {
  const src = readFileSync(new URL("../scripts/check-auth-redirects.mjs", import.meta.url), "utf8");
  assert.match(src, /process\.exit\(2\)/, "missing credentials must exit 2, not 1");
  assert.match(src, /process\.exit\(1\)/, "a real finding must exit 1");
});

test("a host is matched as a host, not as a substring", () => {
  // "console.happitime.biz" contains "happitime.biz". Substring matching
  // reported the directory as allow-listed when only the console was, and
  // would let a lookalike satisfy a REQUIRED host — a check that reports
  // green because it was fooled by a longer string.
  assert.equal(hostOf("https://console.happitime.biz/**"), "console.happitime.biz");
  assert.equal(hostOf("https://happitime.biz/**"), "happitime.biz");
  assert.equal(hostOf("*.happitime.biz"), null, "bare wildcard host has no scheme to parse");
  assert.equal(hostOf("https://*.happitime.biz/**"), "happitime.biz");

  // The lookalike must NOT satisfy the required console host.
  const spoof = evaluateRedirects(
    ["https://console.happitime.biz/**", "https://happitime-console.vercel.app.example.com/**"],
    "x",
  );
  const vercelHost = spoof.results.find((r) => r.host === "happitime-console.vercel.app");
  assert.equal(vercelHost.present, false, "a suffix-extended lookalike must not count");
  assert.equal(spoof.healthy, false);
});

test("non-http schemes are ignored rather than mis-parsed", () => {
  // The mobile deep link is a legitimate entry that should simply never match
  // a web host.
  const h = hostOf("happitime://auth/callback");
  assert.notEqual(h, "console.happitime.biz");
  assert.notEqual(h, "happitime.biz");
});
