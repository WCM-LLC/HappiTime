/** 31-character code alphabet (no 0/O/1/I/L). */
export declare const CHARSET: string;

/** Set of 4-char codes that must not be issued. */
export declare const PROFANITY_DENYLIST: Set<string>;

/**
 * Returns the "service date" (YYYY-MM-DD) for a given UTC instant.
 * The logical day flips at 6:00 AM America/Chicago — anything before
 * 6 AM CT belongs to the prior service date.
 */
export declare function serviceDate(now: Date): string;

/**
 * Generates a 4-character check-in code from a venue secret and service date.
 * Pass counter=0 (the default); internally increments to skip profanity.
 */
export declare function generateCheckinCode(
  secret: string,
  svcDate: string,
  counter?: number,
): string;
