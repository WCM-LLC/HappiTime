// test/auth-health-tripwire.test.mjs
//
// The daily auth tripwire exists because a 2026-06 magic-link outage ran ~30
// days undetected. Its second condition then developed the opposite failure:
// it tripped on "zero email signups in 7 days", which stopped measuring health
// once OAuth overtook email in June 2026, and sat red for 16 consecutive days
// in Jul-Aug 2026 while magic links worked (verified by hand on 2026-08-12).
//
// An alarm that is always on is an alarm nobody reads, and it would have
// buried check 1 — the one that catches a real outage. So condition 2 now
// asks whether requested links CONVERT, and stays silent when nobody asked.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluateEmailConversion, MIN_REQUESTS_TO_JUDGE } from "../scripts/check-auth-health.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

test("no demand is not a fault", () => {
  // The exact state that produced 16 red days: nobody requested a link.
  const { healthy, message } = evaluateEmailConversion({ requests: 0, conversions: 0 });
  assert.equal(healthy, true);
  assert.match(message, /nothing to verify/);
});

test("requests that convert are healthy", () => {
  assert.equal(evaluateEmailConversion({ requests: 4, conversions: 2 }).healthy, true);
  // One request, one arrival — the smallest possible proof the path works.
  assert.equal(evaluateEmailConversion({ requests: 1, conversions: 1 }).healthy, true);
});

test("a couple of unclicked links stay below the bar", () => {
  // People request magic links and wander off. That is not an outage.
  for (let requests = 1; requests < MIN_REQUESTS_TO_JUDGE; requests++) {
    const { healthy } = evaluateEmailConversion({ requests, conversions: 0 });
    assert.equal(healthy, true, `${requests} unconverted request(s) must not trip`);
  }
});

test("links going out with nobody arriving trips", () => {
  // The June signature: /otp returns 200, mail never lands, zero arrivals.
  const { healthy, message } = evaluateEmailConversion({
    requests: MIN_REQUESTS_TO_JUDGE,
    conversions: 0,
  });
  assert.equal(healthy, false);
  assert.match(message, /TRIPWIRE/);
  assert.match(message, /SMTP sender is verified/, "the message must name the June root cause");
});

test("the 5xx check is untouched — it was never the broken half", () => {
  const script = read("scripts/check-auth-health.mjs");
  assert.match(script, /checkAuthEndpointErrors/);
  assert.match(script, /"status":5\[0-9\]\[0-9\]/);
  assert.match(script, /otp\|signup\|recover\|magiclink\|resend/);
});

test("the retired demand condition is gone", () => {
  const script = read("scripts/check-auth-health.mjs");
  assert.doesNotMatch(script, /zero email-provider signups in the trailing 7 days/);
  assert.doesNotMatch(script, /checkEmailSignups/);
  // Conversion counts sign-INS too, not just new signups — an established user
  // returning by magic link is equally good proof the mailer works.
  assert.match(script, /from auth\.identities[\s\S]{0,120}provider = 'email'/);
});

test("importing the script does not run it", () => {
  // The test above already imported it without SUPABASE_ACCESS_TOKEN set; if
  // the CLI guard regressed, this file would have exited 2 before reaching here.
  const script = read("scripts/check-auth-health.mjs");
  assert.match(script, /const isCli = process\.argv\[1\] && import\.meta\.url === pathToFileURL/);
  assert.match(script, /if \(isCli\) \{/);
});
