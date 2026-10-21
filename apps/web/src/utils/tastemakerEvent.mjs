// apps/web/src/utils/tastemakerEvent.mjs
//
// Validation for an event a Tastemaker (super user) proposes by hand from the
// console — no photo, no vision model. The output is a ProposedEvent in the
// exact shape the intake pipeline already consumes (utils/intake-content.ts
// buildEventRows), so a typed event and a scanned flyer become venue_events
// rows the same way and enter the same review queue.
//
// Plain .mjs so the repo-root `npm test` can import it without a TS build.

export const TASTEMAKER_EVENT_TYPES = ['event', 'special', 'live_music', 'trivia', 'sports', 'other'];

export const TASTEMAKER_EVENT_LIMITS = {
  title: 120,
  description: 2000,
  priceInfo: 80,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Today's calendar date (YYYY-MM-DD) in the venue's zone. */
export function localDateString(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Only http(s) — same rule the author-socials form enforces. A javascript: or
 * data: URL on a public event card is the obvious thing to refuse.
 */
export function isSafeHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * fields: plain strings as a form posts them —
 *   venue_id, title, description, event_type, date, start_time, end_time,
 *   is_recurring ('on' | ''), dow (array of '0'..'6'), price_info, external_url
 *
 * Returns { ok: true, proposed, externalUrl, contentType } or
 *         { ok: false, errors: [code, ...] }.
 * Error codes are stable strings the page maps to copy.
 */
export function parseTastemakerEventForm(fields, { now = new Date(), timezone = 'America/Chicago' } = {}) {
  const errors = [];

  const venueId = str(fields.venue_id);
  if (!UUID_RE.test(venueId)) errors.push('venue_required');

  const title = str(fields.title);
  if (!title) errors.push('title_required');
  else if (title.length > TASTEMAKER_EVENT_LIMITS.title) errors.push('title_too_long');

  const description = str(fields.description);
  if (description.length > TASTEMAKER_EVENT_LIMITS.description) errors.push('description_too_long');

  const eventType = str(fields.event_type) || 'event';
  if (!TASTEMAKER_EVENT_TYPES.includes(eventType)) errors.push('event_type_invalid');

  const isRecurring = fields.is_recurring === 'on' || fields.is_recurring === true;

  const rawDow = Array.isArray(fields.dow) ? fields.dow : fields.dow == null ? [] : [fields.dow];
  const dow = [...new Set(rawDow.map((d) => Number(d)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];

  const date = str(fields.date);
  if (isRecurring) {
    if (dow.length === 0) errors.push('weekday_required');
  } else {
    if (!DATE_RE.test(date)) errors.push('date_required');
    else if (date < localDateString(now, timezone)) errors.push('date_in_past');
  }

  const startTime = str(fields.start_time);
  if (!TIME_RE.test(startTime)) errors.push('start_time_required');

  const endTime = str(fields.end_time);
  if (endTime && !TIME_RE.test(endTime)) errors.push('end_time_invalid');

  const priceInfo = str(fields.price_info);
  if (priceInfo.length > TASTEMAKER_EVENT_LIMITS.priceInfo) errors.push('price_info_too_long');

  const externalUrl = str(fields.external_url);
  if (externalUrl && !isSafeHttpUrl(externalUrl)) errors.push('external_url_invalid');

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    venueId,
    externalUrl: externalUrl || null,
    contentType: isRecurring ? 'event_series' : 'event',
    proposed: {
      title,
      description: description || null,
      event_type: eventType,
      date: isRecurring ? null : date,
      start_time: startTime,
      end_time: endTime || null,
      is_recurring: isRecurring,
      recurrence_dow: isRecurring ? dow.sort((a, b) => a - b) : [],
      price_info: priceInfo || null,
    },
  };
}
