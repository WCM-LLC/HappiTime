// Shared display helpers for venue events. Extracted verbatim from
// EventCalendarScreen (which had a duplicate copy in VenuePreviewScreen)
// so VenueEventsScreen can reuse them without a third copy.

export function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dayName}, ${month} ${day} at ${time}`;
}

export function formatRecurrenceRule(rule: string | null, startTime: string): string {
  const DOW_MAP: Record<string, string> = {
    SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat",
  };
  const time = new Date(startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
