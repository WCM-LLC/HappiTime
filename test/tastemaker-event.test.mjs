// test/tastemaker-event.test.mjs
//
// A Tastemaker types an event into the console; the form has to come out as a
// ProposedEvent the intake pipeline already knows how to schedule. These pin
// the validation that stands between the form and venue_events.

import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTastemakerEventForm,
  localDateString,
  isSafeHttpUrl,
} from "../apps/web/src/utils/tastemakerEvent.mjs";

const VENUE = "6c1a2f3e-9b8d-4c7a-a1b2-0f9e8d7c6b5a";
// 2026-10-21 19:00 CDT = 2026-10-22T00:00Z — the UTC date has already rolled.
const NOW = new Date("2026-10-22T00:00:00Z");
const TZ = "America/Chicago";

const base = {
  venue_id: VENUE,
  title: "First Friday: KC Business Besties",
  event_type: "event",
  date: "2026-11-06",
  start_time: "18:00",
  end_time: "21:00",
  is_recurring: "",
  dow: [],
  price_info: "",
  external_url: "",
  description: "",
};

test("a one-off event parses into a ProposedEvent with content_type event", () => {
  const r = parseTastemakerEventForm(base, { now: NOW, timezone: TZ });
  assert.equal(r.ok, true);
  assert.equal(r.contentType, "event");
  assert.equal(r.venueId, VENUE);
  assert.deepEqual(r.proposed, {
    title: "First Friday: KC Business Besties",
    description: null,
    event_type: "event",
    date: "2026-11-06",
    start_time: "18:00",
    end_time: "21:00",
    is_recurring: false,
    recurrence_dow: [],
    price_info: null,
  });
});

test("today in the venue's zone is not 'in the past' even after UTC midnight", () => {
  assert.equal(localDateString(NOW, TZ), "2026-10-21");
  const r = parseTastemakerEventForm({ ...base, date: "2026-10-21" }, { now: NOW, timezone: TZ });
  assert.equal(r.ok, true, JSON.stringify(r));
  const past = parseTastemakerEventForm({ ...base, date: "2026-10-20" }, { now: NOW, timezone: TZ });
  assert.equal(past.ok, false);
  assert.ok(past.errors.includes("date_in_past"));
});

test("a weekly series needs weekdays, ignores the date, and dedupes/sorts dow", () => {
  const r = parseTastemakerEventForm(
    { ...base, is_recurring: "on", date: "", dow: ["4", "2", "4", "9"] },
    { now: NOW, timezone: TZ },
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.contentType, "event_series");
  assert.equal(r.proposed.is_recurring, true);
  assert.equal(r.proposed.date, null);
  assert.deepEqual(r.proposed.recurrence_dow, [2, 4]);

  const none = parseTastemakerEventForm({ ...base, is_recurring: "on", dow: [] }, { now: NOW, timezone: TZ });
  assert.equal(none.ok, false);
  assert.ok(none.errors.includes("weekday_required"));
});

test("required fields and limits are enforced with stable codes", () => {
  const r = parseTastemakerEventForm(
    {
      ...base,
      venue_id: "not-a-uuid",
      title: "",
      event_type: "rave",
      date: "11/06/2026",
      start_time: "6pm",
      end_time: "25:00",
      price_info: "x".repeat(81),
      external_url: "javascript:alert(1)",
      description: "y".repeat(2001),
    },
    { now: NOW, timezone: TZ },
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, [
    "venue_required",
    "title_required",
    "description_too_long",
    "event_type_invalid",
    "date_required",
    "start_time_required",
    "end_time_invalid",
    "price_info_too_long",
    "external_url_invalid",
  ]);
});

test("external_url accepts http(s) only", () => {
  assert.equal(isSafeHttpUrl("https://eventbrite.com/e/123"), true);
  assert.equal(isSafeHttpUrl("http://example.com"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,hi"), false);
  assert.equal(isSafeHttpUrl("eventbrite.com/e/123"), false);
});
