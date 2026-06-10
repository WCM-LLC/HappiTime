// packages/shared-api/src/checkin/code.mjs
//
// Deterministic check-in code generator. Plain ESM (.mjs) so both `node --test`
// (CI, Node 20) and Deno edge functions can import this directly without a TS
// compilation step.  The Deno edge-function copy lives at
// supabase/functions/_shared/checkin-code.ts and MUST implement the identical
// algorithm — anti-drift is enforced by a shared JSON test-vector file
// (supabase/functions/_shared/checkin-test-vectors.json) imported by both test
// suites.
//
// Algorithm
// ---------
// serviceDate(now)
//   The "service date" is the calendar date of (now − 6 h) in America/Chicago.
//   Happy-hour service runs until ~2 AM, so we flip the logical day at 6 AM CT,
//   not midnight.  Everything before 6:00 AM CT belongs to the previous day.
//
// generateCheckinCode(secret, svcDate, counter = 0)
//   msg    = counter > 0 ? `${svcDate}:${counter}` : svcDate
//   h      = HMAC-SHA256(key=secret, msg) → 32 bytes
//   CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  (31 chars, no 0/O/1/I/L)
//   code   = CHARSET[h[0]%31] + CHARSET[h[1]%31] + CHARSET[h[2]%31] + CHARSET[h[3]%31]
//   If code is in PROFANITY_DENYLIST, recurse with counter+1.

import { createHmac } from "node:crypto";

export const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// Minimal denylist of obvious offensive 4-char strings constructable from
// CHARSET (which has no I, O, L — so many common slurs are impossible).
// Expand as needed; must be kept identical in the Deno impl.
export const PROFANITY_DENYLIST = new Set([
  "FUCK",
  "SHIT",
  "CUNT",
  "COCK",
  "CUM",
  "ASS",
  "TITS",
  "FUKU",
  "FKNG",
  "FKUP",
]);

/**
 * Return the "service date" string (YYYY-MM-DD) for a given UTC instant.
 * The logical day flips at 6:00 AM America/Chicago, so anything before 6 AM CT
 * is attributed to the previous calendar date.
 *
 * @param {Date} now
 * @returns {string}
 */
export function serviceDate(now) {
  // Shift back 6 hours, then read the calendar date in CT.
  const shifted = new Date(now.getTime() - 6 * 3600_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/**
 * Generate a 4-character check-in code deterministically from a venue secret
 * and a service date.  Counter is used internally to skip profanity; callers
 * should always start with counter=0 (the default).
 *
 * @param {string} secret
 * @param {string} svcDate  YYYY-MM-DD
 * @param {number} [counter]
 * @returns {string}
 */
export function generateCheckinCode(secret, svcDate, counter = 0) {
  const msg = counter > 0 ? `${svcDate}:${counter}` : svcDate;
  const h = createHmac("sha256", secret).update(msg).digest();
  const code = [0, 1, 2, 3].map((i) => CHARSET[h[i] % 31]).join("");
  return PROFANITY_DENYLIST.has(code)
    ? generateCheckinCode(secret, svcDate, counter + 1)
    : code;
}
