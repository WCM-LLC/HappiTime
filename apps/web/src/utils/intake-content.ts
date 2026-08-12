/**
 * What a scanned photo turned out to be, and how a proposed event becomes a
 * row in venue_events.
 *
 * The vision model proposes a content_type; a human confirms it in the review
 * step before anything is written. Nothing here trusts the model's label on
 * its own — these helpers exist so the proposal is well-formed enough for a
 * person to accept or correct.
 *
 * (Route files can only export handlers and route config, so this cannot live
 * in app/api/intake/extract/route.ts.)
 */

export const CONTENT_TYPES = ['happy_hour', 'event', 'event_series', 'mixed', 'unknown'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** venue_events.event_type check constraint (20260423130000). */
export const EVENT_TYPES = ['event', 'special', 'live_music', 'trivia', 'sports', 'other'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** RRULE weekday codes, indexed 0=Sunday .. 6=Saturday to match `dow`. */
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export type ProposedEvent = {
  title: string;
  description?: string | null;
  event_type?: EventType | null;
  /** YYYY-MM-DD for a one-off; null when recurring. */
  date?: string | null;
  start_time: string;
  end_time?: string | null;
  is_recurring?: boolean;
  /** Weekdays it repeats on, 0=Sunday. Empty when not recurring. */
  recurrence_dow?: number[];
  price_info?: string | null;
};

/**
 * An unrecognized content_type degrades to 'unknown' rather than failing the
 * request. The human confirms the type anyway, and throwing away a good menu
 * extraction over a bad label helps nobody.
 */
export function normalizeContentType(value: unknown): ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value as string)
    ? (value as ContentType)
    : 'unknown';
}

/**
 * Builds the same recurrence string the console writes by hand in
 * event-actions.ts (`FREQ=WEEKLY;BYDAY=TH`). Deliberately server-side: asking
 * a vision model to author an RRULE invites malformed rules that the calendar
 * screens then have to survive.
 */
export function buildRecurrenceRule(dow: number[]): string | null {
  const days = [...new Set(dow)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => RRULE_DAYS[d]);
  return days.length > 0 ? `FREQ=WEEKLY;BYDAY=${days.join(',')}` : null;
}

/**
 * Resolves a proposed event to the concrete `starts_at` venue_events requires
 * (timestamptz NOT NULL), given the venue's timezone.
 *
 * A one-off carries its own date. A recurring event usually does not — a sign
 * reading "Trivia every Thursday" names no date at all — so the first
 * occurrence is the next matching weekday at that time, today included when
 * the time has not yet passed.
 *
 * Returns null when the proposal cannot be placed on a calendar, which the
 * caller must treat as "a human has to fill this in", never as "skip it".
 */
export function resolveEventStart(
  event: ProposedEvent,
  now: Date,
  timeZone = 'America/Chicago',
): { date: string; time: string } | null {
  const time = event.start_time;
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;

  if (event.date && DATE_RE.test(event.date)) return { date: event.date, time };
  if (!event.is_recurring) return null;

  const dows = (event.recurrence_dow ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (dows.length === 0) return null;

  // Work in the venue's local calendar, not the server's.
  const local = new Date(now.toLocaleString('en-US', { timeZone }));
  const todayDow = local.getDay();
  const nowMinutes = local.getHours() * 60 + local.getMinutes();
  const [h, m] = time.split(':').map(Number);
  const eventMinutes = h * 60 + m;

  let bestOffset: number | null = null;
  for (const d of dows) {
    let offset = (d - todayDow + 7) % 7;
    // Today only counts if the event has not already started.
    if (offset === 0 && eventMinutes <= nowMinutes) offset = 7;
    if (bestOffset === null || offset < bestOffset) bestOffset = offset;
  }
  if (bestOffset === null) return null;

  const first = new Date(local);
  first.setDate(first.getDate() + bestOffset);
  const yyyy = first.getFullYear();
  const mm = String(first.getMonth() + 1).padStart(2, '0');
  const dd = String(first.getDate()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time };
}

/**
 * Turns confirmed proposals into venue_events rows.
 *
 * `starts_at` is written as a naive `YYYY-MM-DDTHH:MM` string with the venue's
 * timezone in its own column, matching exactly what createEvent in
 * actions/event-actions.ts already writes from its datetime-local field. That
 * convention is arguable, but a scan writing a DIFFERENT one would put two
 * incompatible shapes in the same column.
 *
 * Anything that cannot be placed on a calendar is returned in `unschedulable`
 * rather than dropped, so the caller can tell a human instead of silently
 * losing an event.
 */
export function buildEventRows(
  events: ProposedEvent[],
  opts: {
    venueId: string;
    timezone: string;
    status: 'draft' | 'published';
    createdBy: string | null;
    now?: Date;
  },
): { rows: Record<string, unknown>[]; unschedulable: string[] } {
  const now = opts.now ?? new Date();
  const rows: Record<string, unknown>[] = [];
  const unschedulable: string[] = [];

  for (const e of events) {
    const title = (e.title ?? '').trim();
    if (!title) continue;

    const start = resolveEventStart(e, now, opts.timezone);
    if (!start) {
      unschedulable.push(title);
      continue;
    }

    const isRecurring = Boolean(e.is_recurring);
    rows.push({
      venue_id: opts.venueId,
      title,
      description: e.description?.trim() || null,
      event_type: e.event_type ?? 'event',
      starts_at: `${start.date}T${start.time}`,
      ends_at: e.end_time ? `${start.date}T${e.end_time}` : null,
      is_recurring: isRecurring,
      recurrence_rule: isRecurring ? buildRecurrenceRule(e.recurrence_dow ?? []) : null,
      timezone: opts.timezone,
      price_info: e.price_info?.trim() || null,
      status: opts.status,
      created_by: opts.createdBy,
    });
  }

  return { rows, unschedulable };
}
