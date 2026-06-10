// packages/shared-api/src/checkin/quarter.mjs
//
// Calendar-quarter helper. Plain ESM (.mjs) so both `node --test`
// (CI, Node 20) and Deno edge functions can import this directly without a TS
// compilation step.  The Deno edge-function copy lives at
// supabase/functions/_shared/quarter.ts and MUST implement the identical
// algorithm — anti-drift is enforced by both test suites asserting the same
// four canonical cases.
//
// Algorithm
// ---------
// currentQuarter(date)
//   Returns the calendar quarter string "YYYY-Q#" for the given UTC date.
//   Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
//   Matches the SQL expression:
//     to_char(date,'YYYY') || '-Q' || extract(quarter from date)

/**
 * Return the calendar quarter string (e.g. "2026-Q2") for a given UTC instant.
 *
 * @param {Date} date
 * @returns {string}
 */
export function currentQuarter(date) {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}
