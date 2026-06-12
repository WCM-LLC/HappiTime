// Holds the single gated action a guest attempted (save / check-in) as DATA
// (an intent), so it can be replayed after the earned signup via FRESH,
// signed-in hook instances — not a stale guest-era closure (which would still
// see user=null and re-gate). Set when the gated guard fires; consumed by
// useGatedActionResume on the App root once a session exists.
export type GatedIntent =
  | { kind: "save"; venueId: string }
  | { kind: "checkin"; body: Record<string, unknown> };

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
