// supabase/functions/verify-checkin/logic.ts
//
// Pure decision helpers for the verify-checkin edge function.
// Separated from the HTTP handler so unit tests can import without
// triggering Deno.serve (which requires --allow-net).
//
// All functions are stateless and have no side effects.

import { serviceDate, generateCheckinCode } from "../_shared/checkin-code.ts";

// Re-export serviceDate for the test file
export { serviceDate };

/** Stamps required to complete a loyalty round. */
export const STAMPS_PER_ROUND = 5;

/** Maximum GPS-fallback check-ins per (user, venue) lifetime. */
export const FALLBACK_LIFETIME_LIMIT = 2;

/** Allowed attempts per rate-limit window. */
export const CHECKIN_RATE_LIMIT = 5;

/** Minutes after 6:00 AM CT during which the prior service-date code is still accepted. */
const GRACE_WINDOW_MINUTES = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

/** Haversine great-circle distance in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** True when the caller is within the venue's geofence radius. */
export function withinGeofence(distanceMeters: number, radiusMeters: number): boolean {
  return distanceMeters <= radiusMeters;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service-date helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decrement a YYYY-MM-DD string by exactly one day.
 * DST-safe: operates on UTC midnight, not wall-clock arithmetic.
 */
export function priorServiceDateStr(svcDateStr: string): string {
  const d = new Date(`${svcDateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * True when `now` falls within the 10-minute grace window starting at
 * 6:00 AM America/Chicago (the CT hour when the service date flips).
 * The prior-service-date code is accepted during this window.
 */
export function isGraceWindow(now: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const m = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  return h === 6 && m < GRACE_WINDOW_MINUTES;
}

/**
 * Returns true when `submitted` matches the current service-date code,
 * OR (during the grace window) the prior service-date code.
 */
export function codeMatchesWithGrace(
  secret: string,
  now: Date,
  submitted: string,
): boolean {
  const today = serviceDate(now);
  if (submitted === generateCheckinCode(secret, today)) return true;
  if (isGraceWindow(now)) {
    const yesterday = priorServiceDateStr(today);
    if (submitted === generateCheckinCode(secret, yesterday)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stamps + loyalty
// ─────────────────────────────────────────────────────────────────────────────

/** Returns max(0, STAMPS_PER_ROUND - stamps). */
export function stampsToNextRound(stamps: number): number {
  return Math.max(0, STAMPS_PER_ROUND - stamps);
}

/**
 * True only when there is no prior attribution event AND no prior check-in
 * for (user, venue). Must be computed BEFORE the writes.
 */
export function isFirstVisit(
  hadPriorAttribution: boolean,
  hadPriorCheckin: boolean,
): boolean {
  return !hadPriorAttribution && !hadPriorCheckin;
}

/** Returns max(0, limit - usedCount). Never negative. */
export function attemptsRemaining(limit: number, usedCount: number): number {
  return Math.max(0, limit - usedCount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Redemption
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when the user has accumulated enough stamps to redeem a free round.
 * The caller must pass the *current* stamp count (i.e. post-checkin, pre-redeem).
 */
export function canRedeem(stamps: number): boolean {
  return stamps >= STAMPS_PER_ROUND;
}
