import type { VenueEvent } from "./queries";

// Only handles FREQ=WEEKLY;BYDAY=XX — MONTHLY/DAILY/YEARLY rules are not supported
const BYDAY_TO_DOW: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

export function eventOccursOnDow(event: VenueEvent, dow: number): boolean {
  if (!event.is_recurring || !event.recurrence_rule) return false;
  const match = event.recurrence_rule.match(/BYDAY=([A-Z,]+)/);
  if (!match) return false;
  return match[1].split(",").some((d) => BYDAY_TO_DOW[d] === dow);
}

export function eventOccursToday(event: VenueEvent, today: Date): boolean {
  const eventDate = new Date(event.starts_at);
  const sameDay =
    eventDate.getFullYear() === today.getFullYear() &&
    eventDate.getMonth() === today.getMonth() &&
    eventDate.getDate() === today.getDate();
  if (sameDay) return true;
  return eventOccursOnDow(event, today.getDay());
}
