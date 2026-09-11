// QR scan → check-in hand-off on the venue screen (apps/mobile VenuePreviewScreen).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { scanCheckInStep } from "../apps/mobile/src/lib/scanCheckIn.mjs";

const ready = {
  pending: true,
  locationChecked: true,
  hasUserLocation: true,
  hasVenueGeo: true,
  hasVenueName: true,
  insideGeofence: true,
};

test("opens check-in once a scanner is confirmed inside the geofence", () => {
  assert.equal(scanCheckInStep(ready), "open");
});

test("non-scan arrivals and spent hand-offs do nothing", () => {
  assert.equal(scanCheckInStep({ ...ready, pending: false }), "idle");
});

test("waits while location, venue coords or name are still loading", () => {
  assert.equal(scanCheckInStep({ ...ready, locationChecked: false, hasUserLocation: false }), "wait");
  assert.equal(scanCheckInStep({ ...ready, hasVenueGeo: false, insideGeofence: false }), "wait");
  assert.equal(scanCheckInStep({ ...ready, hasVenueName: false }), "wait");
});

test("stays on the venue page when not at the venue or location is unavailable", () => {
  assert.equal(scanCheckInStep({ ...ready, insideGeofence: false }), "stay");
  assert.equal(scanCheckInStep({ ...ready, hasUserLocation: false, insideGeofence: false }), "stay");
});

test("VenuePreviewScreen wires the hand-off and no longer claims a check-in on scan", () => {
  const src = readFileSync(new URL("../apps/mobile/src/screens/VenuePreviewScreen.tsx", import.meta.url), "utf8");
  assert.match(src, /scanCheckInStep\(/);
  assert.match(src, /navigation\.navigate\("CheckIn"/);
  assert.ok(!src.includes("Checked in!"), "banner must not say 'Checked in!' before a stamp exists");
});
