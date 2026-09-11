import assert from "node:assert/strict";
import test from "node:test";
import { shouldTrack } from "./visitTrackingGate.mjs";

test("no consent → no tracking", () => {
  assert.equal(shouldTrack({ consent: false, consentLoading: false, venueCount: 5 }), false);
});

test("still loading consent → no tracking even if consent true", () => {
  assert.equal(shouldTrack({ consent: true, consentLoading: true, venueCount: 5 }), false);
});

test("consent true but no venues → no tracking", () => {
  assert.equal(shouldTrack({ consent: true, consentLoading: false, venueCount: 0 }), false);
});

test("consent true, loaded, venues present → track", () => {
  assert.equal(shouldTrack({ consent: true, consentLoading: false, venueCount: 1 }), true);
});
