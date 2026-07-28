// Types only — the implementation lives in kcTime.mjs (plain ESM so
// `node --test` can exercise the timezone behaviour directly).

export declare const KC_TZ: string;

/** A Date whose local calendar fields mirror Kansas City's wall clock. */
export declare function kcNow(reference?: Date): Date;

/** Kansas City day-of-week (0=Sun) and minutes past midnight. */
export declare function kcNowParts(reference?: Date): { dow: number; minutes: number };

/** "5:47 PM" from minutes past midnight. */
export declare function formatClock(minutes: number): string;
