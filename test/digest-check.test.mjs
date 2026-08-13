// test/digest-check.test.mjs
//
// Guards the venue-digest alarm channel.
//
// The digest already detects its own failure: it logs an ALERT and returns 500
// when it sends zero emails while active venues exist. That check was working
// on 2026-08-12 — it fired at 11:00:11 UTC. Nobody found out, because the only
// thing it does with the alert is email it, through the same Resend account
// that was answering "401 API key is invalid".
//
// So these tests are not about detecting the condition. They are about the
// channel: given the log lines the incident actually produced, does the check
// fail the workflow run?

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateDigest, WINDOW_HOURS } from "../scripts/check-digest.mjs";

// Copied verbatim from Supabase function_logs, 2026-08-12.
const REAL_ALERT =
  "[send-venue-digest] ALERT: 0 emails sent but 5 active venue(s) exist. " +
  "Possible misconfiguration. Date=2026-08-12 skipped=0 errors=5\n";
const REAL_RESEND_ERROR =
  '[send-venue-digest] Resend error for venue ea4bb434-8077-4653-a55d-da6287f46e0d: ' +
  '{"statusCode":401,"name":"validation_error","message":"API key is invalid"}\n';

test("the real 2026-08-12 alert line trips the alarm", () => {
  const v = evaluateDigest([{ timestamp: "2026-08-12T11:00:11.445000", level: "error", msg: REAL_ALERT }]);
  assert.equal(v.healthy, false, "this exact line went unnoticed once already");
  assert.match(v.message, /zero emails sent while active venues exist/);
  assert.match(v.message, /2026-08-12T11:00:11/, "the finding must say when");
});

test("the real Resend 401 line trips the alarm", () => {
  const v = evaluateDigest([{ timestamp: "2026-08-12T11:00:10", level: "error", msg: REAL_RESEND_ERROR }]);
  assert.equal(v.healthy, false);
  assert.match(v.message, /Resend rejected a send/);
});

test("a missing key is treated as seriously as a rejected one", () => {
  // A digest that cannot send is not a lesser problem than one that fails to.
  const v = evaluateDigest([
    { timestamp: "2026-08-12T11:00:00", level: "warning", msg: "[send-venue-digest] RESEND_API_KEY not set — email skipped for venue abc" },
  ]);
  assert.equal(v.healthy, false);
  assert.match(v.message, /RESEND_API_KEY missing/);
});

test("a quiet, healthy window passes", () => {
  const v = evaluateDigest([
    { timestamp: "2026-08-12T11:00:00", level: "info", msg: "[send-venue-digest] sent 5 of 5" },
  ]);
  assert.equal(v.healthy, true);
  assert.match(v.message, new RegExp(`last ${WINDOW_HOURS}h`));
});

test("no log lines at all is not treated as a failure", () => {
  // Deliberate: the digest self-skips outside 6am CT and logs nothing, so an
  // empty window is normal. Absence-detection would cry wolf every run.
  const v = evaluateDigest([]);
  assert.equal(v.healthy, true);
});

test("every finding is reported, not just the first", () => {
  const v = evaluateDigest([
    { timestamp: "t1", level: "error", msg: REAL_ALERT },
    { timestamp: "t2", level: "error", msg: REAL_RESEND_ERROR },
  ]);
  assert.equal(v.healthy, false);
  assert.match(v.message, /2 finding\(s\)/);
});

test("one log line yields one finding even when patterns overlap", () => {
  // REAL_ALERT contains both "0 emails sent" and, in other runs, could contain
  // more. Double-counting would inflate the number a human reads under stress.
  const v = evaluateDigest([{ timestamp: "t", level: "error", msg: REAL_ALERT }]);
  assert.match(v.message, /1 finding\(s\)/);
});

test("unrelated digest chatter does not trip it", () => {
  const v = evaluateDigest([
    { timestamp: "t", level: "info", msg: "[send-venue-digest] not 6am CT, skipping" },
  ]);
  assert.equal(v.healthy, true);
});

test("matching is case-insensitive", () => {
  const v = evaluateDigest([{ timestamp: "t", level: "error", msg: "[SEND-VENUE-DIGEST] RESEND ERROR for venue x" }]);
  assert.equal(v.healthy, false);
});

test("the alarm channel never routes through email", () => {
  // The entire point: the existing in-function alert emails you, using the
  // system it is alarming about. This path must not reintroduce that.
  const script = readFileSync(new URL("../scripts/check-digest.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(script, /resend\.emails\.send|api\.resend\.com|nodemailer/, "must not send mail");
  assert.match(script, /process\.exit\(1\)/, "it signals by failing the run");
});
