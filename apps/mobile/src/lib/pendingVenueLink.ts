// src/lib/pendingVenueLink.ts
//
// Module-level stash for a venue deep link captured BEFORE the navigator is
// mounted — e.g. a cold-start QR scan while the auth / "Welcome" gate is showing
// (AppNavigator, which hosts useVenueDeepLink, isn't mounted yet there).
//
// Flow: useVenueLinkCapture (mounted at the App root, above the gate) writes the
// URL here and nudges the app out of the gate into guest mode; once AppNavigator
// mounts, useVenueDeepLink consumes it. This is why a scanned QR can't be dropped
// by the unauthenticated gate anymore.

let pending: string | null = null;

/** Stash a venue deep-link URL to be routed once the navigator is mounted. */
export function setPendingVenueLink(url: string): void {
  pending = url;
}

/** Return and clear the stashed venue deep-link URL (null if none). */
export function takePendingVenueLink(): string | null {
  const url = pending;
  pending = null;
  return url;
}
