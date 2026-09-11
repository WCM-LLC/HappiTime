// src/lib/scanCheckIn.mjs
//
// Decides what a venue screen opened from a QR scan should do next. Plain ESM
// with a colocated .d.ts (same arrangement as parseVenueLink) so
// test/scan-checkin-handoff.test.mjs can execute it on CI's Node 20.
//
// A table QR (happitime.biz/v/{slug}?src=qr) opens VenuePreview with fromScan.
// Someone scanning a QR on a table is there to check in, so once we know they're
// inside the venue's geofence we hand straight off to the stamp-code screen.
// Outside the fence (scanned a flyer at home, GPS off/denied) they stay on the
// venue page — the geofenced Check In button there explains why it's disabled.
//
// Returns:
//   "idle" — not a scan arrival, or the hand-off already happened/was declined
//   "wait" — still resolving location / venue coords / venue name
//   "open" — navigate to CheckIn now
//   "stay" — resolved, but not at the venue: leave them on the venue page

export function scanCheckInStep({
  pending,
  locationChecked,
  hasUserLocation,
  hasVenueGeo,
  hasVenueName,
  insideGeofence,
}) {
  if (!pending) return "idle";
  if (!locationChecked && !hasUserLocation) return "wait";
  // Location resolved without a fix = permission denied or GPS failure.
  if (!hasUserLocation) return "stay";
  if (!hasVenueGeo || !hasVenueName) return "wait";
  return insideGeofence ? "open" : "stay";
}
