// Holds the SAVE action a guest attempted (as data: the venueId) so it can be
// replayed after the earned signup via a FRESH, signed-in hook instance — not a
// stale guest-era closure (which would still see user=null and re-gate).
//
// Check-in is intentionally NOT replayed here: a check-in's payoff is the on-screen
// stamp result, and its lat/lng/code can go stale across the magic-link round-trip.
// After signup the user lands back on the (now signed-in) check-in screen and
// re-taps with fresh geo + live feedback.
export type GatedIntent = { kind: "save"; venueId: string };

let pending: GatedIntent | null = null;

export function setPendingIntent(intent: GatedIntent): void {
  pending = intent;
}

/** Read and clear the pending intent (null if none). */
export function takePendingIntent(): GatedIntent | null {
  const i = pending;
  pending = null;
  return i;
}

export function clearPendingIntent(): void {
  pending = null;
}
