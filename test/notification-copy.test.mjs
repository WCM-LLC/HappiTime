// test/notification-copy.test.mjs
//
// Locks the notification copy table and enforces the voice rules:
// titles lead with an emoji and never end with punctuation; bodies are one
// sentence ending with a period; times are absolute 12-hour Central.
import assert from "node:assert/strict";
import test from "node:test";
import {
  followCopy,
  venueSaveCopy,
  itineraryShareCopy,
  happyHourPublishedCopy,
  happyHourUpdatedCopy,
  happyHourStartingCopy,
  eventStartingCopy,
  visitRatingCopy,
  formatCentralClock,
  formatCentralInstant,
} from "../supabase/functions/_shared/notification-copy.mjs";

const ALL = [
  followCopy("Bri Baker"),
  venueSaveCopy("Bri Baker", "Rockhill Grille"),
  itineraryShareCopy("Bri Baker"),
  happyHourPublishedCopy("Rockhill Grille"),
  happyHourUpdatedCopy("Rockhill Grille"),
  happyHourStartingCopy("Rockhill Grille", "17:00", "Patio Hour"),
  eventStartingCopy("Trivia Night", "Rockhill Grille", "2026-07-31T23:00:00.000Z"),
  visitRatingCopy("Rockhill Grille"),
];

test("exact locked strings", () => {
  assert.deepEqual(followCopy("Bri Baker"), {
    title: "👋 New follower",
    body: "Bri Baker started following you.",
  });
  assert.deepEqual(venueSaveCopy("Bri Baker", "Rockhill Grille"), {
    title: "🍸 Bri Baker saved Rockhill Grille",
    body: "See what caught their eye.",
  });
  assert.deepEqual(itineraryShareCopy("Bri Baker"), {
    title: "📋 Bri Baker shared an itinerary",
    body: "Open it to start planning.",
  });
  assert.deepEqual(happyHourPublishedCopy("Rockhill Grille"), {
    title: "🆕 New happy hour at Rockhill Grille",
    body: "Just published — see times and specials.",
  });
  assert.deepEqual(happyHourUpdatedCopy("Rockhill Grille"), {
    title: "📝 Rockhill Grille updated their happy hour",
    body: "See what changed.",
  });
  assert.deepEqual(happyHourStartingCopy("Rockhill Grille", "17:00", "Patio Hour"), {
    title: "🍹 Happy hour at Rockhill Grille",
    body: "Starts at 5:00 PM · Patio Hour.",
  });
  assert.deepEqual(happyHourStartingCopy("Rockhill Grille", "17:00", null), {
    title: "🍹 Happy hour at Rockhill Grille",
    body: "Starts at 5:00 PM.",
  });
  assert.deepEqual(visitRatingCopy("Rockhill Grille"), {
    title: "⭐ How was Rockhill Grille?",
    body: "Tap to rate your visit.",
  });
});

test("event copy formats the instant in Central time", () => {
  // 2026-07-31T23:00:00Z is 6:00 PM America/Chicago (CDT, UTC-5).
  assert.deepEqual(eventStartingCopy("Trivia Night", "Rockhill Grille", "2026-07-31T23:00:00.000Z"), {
    title: "🎟️ Trivia Night",
    body: "Starts at 6:00 PM at Rockhill Grille.",
  });
});

test("voice rules: emoji-led titles, no title punctuation, bodies end with a period", () => {
  for (const { title, body } of ALL) {
    assert.doesNotMatch(title, /[.!]$/, `title "${title}" must not end with punctuation`);
    assert.match(body, /\.$/, `body "${body}" must end with a period`);
    assert.doesNotMatch(title, /^[A-Za-z]/, `title "${title}" must lead with an emoji glyph`);
  }
});

test("voice rules: no 24-hour times anywhere", () => {
  for (const { title, body } of ALL) {
    assert.doesNotMatch(`${title} ${body}`, /\b(?:1[3-9]|2[0-3]):\d{2}\b/, "24h time leaked into copy");
  }
});

test("fallbacks: missing actor and venue names", () => {
  assert.equal(followCopy("").body, "Someone started following you.");
  assert.equal(venueSaveCopy(null, null).title, "🍸 Someone saved a venue");
  assert.equal(visitRatingCopy(undefined).title, "⭐ How was your visit?");
});

test("time formatters", () => {
  assert.equal(formatCentralClock("17:00"), "5:00 PM");
  assert.equal(formatCentralClock("00:30"), "12:30 AM");
  assert.equal(formatCentralClock("12:05"), "12:05 PM");
  assert.equal(formatCentralInstant("2026-01-15T18:00:00.000Z"), "12:00 PM"); // CST, UTC-6
});
