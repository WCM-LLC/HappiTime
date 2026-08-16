// Types only — the implementation lives in kcTime.mjs (plain ESM so
// `node --test` can exercise the timezone behaviour directly).

export declare const KC_TZ: string;

/** A Date whose local calendar fields mirror Kansas City's wall clock. */
export declare function kcNow(reference?: Date): Date;

/** Kansas City day-of-week (0=Sun) and minutes past midnight. */
export declare function kcNowParts(reference?: Date): { dow: number; minutes: number };

/** "5:47 PM" from minutes past midnight. */
export declare function formatClock(minutes: number): string;

/**
 * Format a `timestamptz` from venue_events in the event's own zone.
 *
 * Never format event timestamps with a bare `toLocale*` call — the runtime
 * zone on Vercel is UTC, which shifts every KC time by five hours.
 */
export declare function formatEventDate(iso: string, timeZone?: string): string;

/** "3:00 PM" in the event's zone. */
export declare function formatEventTime(iso: string, timeZone?: string): string;

/** "3:00 PM – 9:00 PM", or just the start when there is no end. */
export declare function formatEventTimeRange(
  startIso: string,
  endIso: string | null | undefined,
  timeZone?: string,
): string;
