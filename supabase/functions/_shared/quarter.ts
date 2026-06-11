// supabase/functions/_shared/quarter.ts
//
// Calendar-quarter helper — Deno/Edge edition.
// This is the Deno mirror of packages/shared-api/src/checkin/quarter.mjs.
// Both implementations MUST stay byte-for-byte identical in algorithm.
// Anti-drift is enforced by both test suites asserting the same four canonical
// cases.  If either test suite fails, the impls have drifted.
//
// Algorithm matches the SQL expression:
//   to_char(date,'YYYY') || '-Q' || extract(quarter from date)

/**
 * Return the calendar quarter string "YYYY-Q#" for a given UTC instant.
 * Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
 */
export function currentQuarter(date: Date): string {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}
