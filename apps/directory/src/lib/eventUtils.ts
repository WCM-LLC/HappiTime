import type { VenueEvent } from "./queries";
import { occursOnLocalDate } from "./eventSchedule";

/**
 * Does the event happen on `day`?
 *
 * `day` is a *carrier* Date whose local calendar fields are the day being
 * asked about — `kcNow()` for "today", or a cell of the month calendar. Only
 * its year/month/date are read; the event's own date is resolved in the
 * event's timezone, never the browser's.
 *
 * Handles weekly, monthly ("2nd Thu") and daily series, and stops matching
 * once a series has ended — see lib/eventSchedule.
 */
export function eventOccursToday(event: VenueEvent, day: Date): boolean {
  return occursOnLocalDate(event, day.getFullYear(), day.getMonth() + 1, day.getDate());
}
