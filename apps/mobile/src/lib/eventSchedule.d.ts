// Types only — the implementation lives in eventSchedule.mjs (plain ESM so
// `node --test` can exercise it directly).

/** The venue_events fields the schedule logic reads. */
export type SchedulableEvent = {
  starts_at: string;
  ends_at?: string | null;
  timezone?: string | null;
  is_recurring: boolean;
  recurrence_rule?: string | null;
  title?: string | null;
};

export declare const DEFAULT_TZ: string;
export declare const ONE_OFF_GRACE_MS: number;
export declare const SERIES_SPAN_MS: number;

export declare function localParts(
  instant: Date,
  tz?: string,
): { y: number; m: number; d: number; h: number; mi: number; s: number };

export declare function zonedToUtc(
  parts: { y: number; m: number; d: number; h: number; mi: number; s: number },
  tz?: string,
): Date;

export declare function parseRule(rule: string | null | undefined): {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  byday: { nth: number | null; dow: number }[];
  until: Date | null;
} | null;

/** `ends_at` when it closes a single occurrence; null when it marks the end of a series. */
export declare function occurrenceEnd(event: SchedulableEvent): Date | null;

/** When a recurring series stops for good, or null if open-ended. */
export declare function seriesEnd(event: SchedulableEvent): Date | null;

/** First occurrence at or after `from`; null if over or unschedulable. */
export declare function nextOccurrence(event: SchedulableEvent, from?: Date): Date | null;

/** Does the event happen on this calendar date in its own timezone? `m` is 1-based. */
export declare function occursOnLocalDate(event: SchedulableEvent, y: number, m: number, d: number): boolean;

/** Should this event still be listed? */
export declare function isEventLive(event: SchedulableEvent, now?: Date): boolean;

/** Live events only, soonest first (series by next occurrence). */
export declare function liveEventsSorted<T extends SchedulableEvent>(events: readonly T[] | null | undefined, now?: Date): T[];

/** "Every Tue", "Daily", "2nd Thu of the month", or "Recurring" when unknown. */
export declare function recurrenceLabel(rule: string | null | undefined): string;
