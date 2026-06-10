// supabase/functions/_shared/checkin-code.ts
//
// Deterministic check-in code generator — Deno/Edge edition.
// This is the Deno mirror of packages/shared-api/src/checkin/code.mjs.
// Both implementations MUST stay byte-for-byte identical in algorithm.
// Anti-drift is enforced by the shared test-vector file:
//   supabase/functions/_shared/checkin-test-vectors.json
// imported by BOTH test suites.  If either test suite fails, the impls have drifted.
//
// Deno supports node:crypto (Node compat layer), so we use createHmac to
// guarantee the exact same byte output as the Node implementation.

import { createHmac } from "node:crypto";

export const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// Minimal denylist of obvious offensive 4-char strings constructable from
// CHARSET (which has no I, O, L — so many common slurs are impossible).
// Must be kept IDENTICAL to the list in packages/shared-api/src/checkin/code.mjs.
export const PROFANITY_DENYLIST: Set<string> = new Set([
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
 * The logical day flips at 6:00 AM America/Chicago — anything before
 * 6 AM CT belongs to the prior service date.
 */
export function serviceDate(now: Date): string {
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
 */
export function generateCheckinCode(
  secret: string,
  svcDate: string,
  counter = 0,
): string {
  const msg = counter > 0 ? `${svcDate}:${counter}` : svcDate;
  const h = createHmac("sha256", secret).update(msg).digest();
  const code = [0, 1, 2, 3].map((i) => CHARSET[h[i] % 31]).join("");
  return PROFANITY_DENYLIST.has(code)
    ? generateCheckinCode(secret, svcDate, counter + 1)
    : code;
}
