// src/lib/pendingReferral.mjs
//
// Module-level stash for an Insider referral handle captured BEFORE the user
// is signed in — a ?ref param seen on a venue/itinerary deep link, or a
// scanned /r/{handle} link — all arriving at the root guest gate before an
// auth session exists.
//
// Flow: useVenueLinkCapture (mounted at App root, above the gate) writes the
// handle here; useReferralCapture reads it on the first signed-in session and
// calls record_referral (idempotent / first-wins RPC) to attribute the user.
//
// Plain ESM (.mjs) with a colocated .d.ts so `node --test` can EXECUTE it on
// Node 20 (which cannot import .ts) while the app gets strict-mode types.

let pending = null;

/** Stash an Insider referral handle to be recorded on the next signed-in session. */
export function setPendingReferral(handle) {
  pending = handle.replace(/^@/, "").toLowerCase();
}

/** Return and clear the stashed referral handle (null if none). */
export function takePendingReferral() {
  const h = pending;
  pending = null;
  return h;
}
