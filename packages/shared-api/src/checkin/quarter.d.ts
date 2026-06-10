/**
 * Returns the calendar quarter string "YYYY-Q#" for a given UTC instant.
 * Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
 * Matches the SQL expression:
 *   to_char(date,'YYYY') || '-Q' || extract(quarter from date)
 */
export declare function currentQuarter(date: Date): string;
