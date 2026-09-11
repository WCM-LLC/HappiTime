// test/contact-form-delivery.test.mjs
//
// Guards the public contact form on happitime.biz — the only inbound route a
// prospective venue has, and the one email path whose failure a visitor can
// actually see.
//
// It was broken: no SMTP_* vars exist in any happitime-directory environment,
// so getSmtpConfig() threw and every submission returned a 500. It now sends
// through SMTP2GO's HTTP API, because the account credential is an API key and
// SMTP2GO API keys are NOT SMTP credentials — authenticating to
// mail.smtp2go.com with the key returns "535 Incorrect authentication data".

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const ROUTE = "apps/directory/src/app/api/contact/route.ts";

test("the contact form no longer depends on SMTP credentials", () => {
  const route = read(ROUTE);
  assert.doesNotMatch(route, /nodemailer/, "nodemailer required SMTP creds that do not exist");
  assert.doesNotMatch(route, /SMTP_HOST|SMTP_USER|SMTP_PASS|SMTP_PORT|SMTP_SECURE/,
    "the SMTP_* vars were never set in any happitime-directory environment");
  assert.match(route, /api\.smtp2go\.com\/v3\/email\/send/);
  assert.match(route, /X-Smtp2go-Api-Key/);
});

test("a provider 200 is not treated as delivery", () => {
  // SMTP2GO returns HTTP 200 with {"succeeded":0,"failed":1} for a rejected
  // message. Accepting that as success is the exact shape of the Resend
  // outage, where a broken path kept reporting fine.
  const route = read(ROUTE);
  assert.match(route, /succeeded < 1/);
  assert.match(route, /!res\.ok \|\| succeeded < 1/,
    "both transport failure and zero-accepted must throw");
});

test("misconfiguration still fails loudly, not silently", () => {
  // The visitor sees a 500 and can try again or use another channel. A
  // silently-swallowed submission is a lost lead nobody ever learns about.
  const route = read(ROUTE);
  assert.match(route, /if \(!apiKey \|\| !sender \|\| !to\)/);
  assert.match(route, /throw new Error\("Email service is not configured\."\)/);
  // And the caller must still convert that into a 500 the user can see.
  assert.match(route, /We could not send your request right now/);
});

test("the visitor's address rides in Reply-To, not in From", () => {
  // The envelope has to stay on a domain SMTP2GO is authorised for, or SPF and
  // DKIM fail; a reply still needs to reach the person who wrote in.
  const route = read(ROUTE);
  assert.match(route, /custom_headers: \[\{ header: "Reply-To", value: params\.replyTo \}\]/);
  assert.match(route, /sender: params\.config\.sender/);
});

test("attachments are sent as base64 blobs in the API's shape", () => {
  const route = read(ROUTE);
  assert.match(route, /fileblob: buffer\.toString\("base64"\)/);
  assert.match(route, /mimetype: file\.type/);
  // Omitted entirely when there are none, rather than sent as an empty array.
  assert.match(route, /params\.attachments\.length > 0 \? \{ attachments: params\.attachments \} : \{\}/);
});

test("the existing abuse and size limits are untouched", () => {
  // This change was about transport only. The validation in front of it is
  // what keeps the endpoint from becoming a relay.
  const route = read(ROUTE);
  assert.match(route, /RATE_LIMIT_MAX_REQUESTS = 5/);
  assert.match(route, /RATE_LIMIT_WINDOW_SECONDS = 60/);
  assert.match(route, /MAX_FILE_COUNT = 3/);
  assert.match(route, /MAX_FILE_SIZE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(route, /ACCEPTED_FILE_TYPES/);
  assert.match(route, /check_rate_limit/);
});

test("the sender default is a domain SMTP2GO is authorised for", () => {
  // happitime.biz carries SMTP2GO DKIM and return-path CNAMEs; an arbitrary
  // default would fail SPF/DKIM and land the form in spam.
  const route = read(ROUTE);
  assert.match(route, /"HappiTime <noreply@happitime\.biz>"/);
  assert.match(route, /SUPPORT_RECIPIENT_EMAIL \?\? "admin@happitime\.biz"/);
});
