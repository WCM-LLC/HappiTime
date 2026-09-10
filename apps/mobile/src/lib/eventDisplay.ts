// Shared display helpers for venue events. Extracted verbatim from
// EventCalendarScreen (which had a duplicate copy in VenuePreviewScreen)
// so VenueEventsScreen can reuse them without a third copy.

// Event times are a property of the VENUE, not of wherever the phone happens to
// be. Formatting without an explicit `timeZone` uses the device zone, so a user
// visiting from another state — or a KC user whose phone is still on Pacific
// after a trip — sees the wrong time for a bar three blocks away. Pass the
// event's `timezone` column; KC is only the fallback.
export const VENUE_FALLBACK_TZ = "America/Chicago";

export function formatEventDate(dateStr: string, timeZone: string = VENUE_FALLBACK_TZ): string {
  const d = new Date(dateStr);
  const dayName = d.toLocaleDateString("en-US", { timeZone, weekday: "short" });
  const month = d.toLocaleDateString("en-US", { timeZone, month: "short" });
  const day = d.toLocaleDateString("en-US", { timeZone, day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${dayName}, ${month} ${day} at ${time}`;
}

export function formatEventTime(iso: string, timeZone: string = VENUE_FALLBACK_TZ): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

export function formatRecurrenceRule(
  rule: string | null,
  startTime: string,
  timeZone: string = VENUE_FALLBACK_TZ,
): string {
  const DOW_MAP: Record<string, string> = {
    SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat",
  };
  const time = formatEventTime(startTime, timeZone);
  if (!rule) return `Recurring at ${time}`;
  const match = rule.match(/BYDAY=([A-Z,]+)/);
  if (!match) return `Recurring at ${time}`;
  const days = match[1].split(",").map((d) => DOW_MAP[d] ?? d).join(", ");
  return `Every ${days} at ${time}`;
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  special: "Special",
  live_music: "Live Music",
  trivia: "Trivia",
  sports: "Sports",
  other: "Other",
};
