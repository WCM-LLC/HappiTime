#!/usr/bin/env node
/**
 * generate-apple-secret.mjs
 *
 * Generates the Sign in with Apple "client secret" - a short-lived ES256-signed
 * JWT - from your Apple .p8 private key. Paste the output into Supabase:
 *   Auth > Providers > Apple > "Secret Key (for OAuth)"
 *
 * The .p8 itself is NOT the secret. Apple expects a JWT signed by the .p8,
 * which is what this script produces.
 *
 * Token lifetime: 6 months (Apple's max). Set a reminder to rotate before it
 * expires. When it does, Sign in with Apple breaks silently for every user.
 *
 * Zero dependencies - uses Node's built-in `node:crypto` (Node 16+).
 *
 * Usage (env vars):
 *   APPLE_TEAM_ID=XXXXXXXXXX \
 *   APPLE_KEY_ID=XXXXXXXXXX \
 *   APPLE_CLIENT_ID=com.happitime.signin \
 *   APPLE_P8_PATH=./AuthKey_XXXXXXXXXX.p8 \
 *   node scripts/generate-apple-secret.mjs
 *
 * The script intentionally requires env vars so Apple identifiers and local
 * private-key paths do not end up committed as source defaults.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPrivateKey, createSign } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TEAM_ID = process.env.APPLE_TEAM_ID;       // 10-char Apple Team ID
const KEY_ID = process.env.APPLE_KEY_ID;         // 10-char .p8 Key ID
const CLIENT_ID = process.env.APPLE_CLIENT_ID;   // Services ID or App ID configured in Supabase
const P8_PATH = process.env.APPLE_P8_PATH;       // Path to .p8 file

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------
function die(msg) {
  console.error(`\nError: ${msg}\n`);
  process.exit(1);
}

if (!TEAM_ID) die("APPLE_TEAM_ID is not set.");
if (!KEY_ID) die("APPLE_KEY_ID is not set.");
if (!CLIENT_ID) die("APPLE_CLIENT_ID is not set.");
if (!P8_PATH) die("APPLE_P8_PATH is not set.");

let p8Pem;
try {
  p8Pem = readFileSync(resolve(P8_PATH), "utf8");
} catch (err) {
  die(`Could not read .p8 file at ${P8_PATH}: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Helpers - base64url + ES256 JWT signing with raw r||s output
// ---------------------------------------------------------------------------
function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signES256(unsignedToken, privateKey) {
  const signer = createSign("SHA256");
  signer.update(unsignedToken);
  signer.end();
  // dsaEncoding: 'ieee-p1363' produces the raw r||s format JWT requires
  // (instead of the DER format Node uses by default for ECDSA).
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return base64url(signature);
}

// ---------------------------------------------------------------------------
// Build + sign the JWT
// ---------------------------------------------------------------------------
const SIX_MONTHS_SECONDS = 15777000;
const now = Math.floor(Date.now() / 1000);
const exp = now + SIX_MONTHS_SECONDS;

const header = {
  alg: "ES256",
  kid: KEY_ID,
  typ: "JWT",
};

const payload = {
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: "https://appleid.apple.com",
  sub: CLIENT_ID,
};

let privateKey;
try {
  privateKey = createPrivateKey({ key: p8Pem, format: "pem" });
} catch (err) {
  die(`Could not parse .p8 as a PEM private key: ${err.message}`);
}

const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
const signature = signES256(unsigned, privateKey);
const token = `${unsigned}.${signature}`;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const expDate = new Date(exp * 1000);

console.log("\n--------------------------------------------------------------");
console.log("Apple Sign-In client secret (paste into Supabase):");
console.log("--------------------------------------------------------------\n");
console.log(token);
console.log("\n--------------------------------------------------------------");
console.log(`Team ID:    ${TEAM_ID}`);
console.log(`Key ID:     ${KEY_ID}`);
console.log(`Client ID:  ${CLIENT_ID}`);
console.log(`Expires:    ${expDate.toISOString()}  (${expDate.toDateString()})`);
console.log("--------------------------------------------------------------\n");
console.log("Set a calendar reminder ~5 months out to rotate this token.");
console.log("    When it expires, Sign in with Apple silently breaks.\n");
