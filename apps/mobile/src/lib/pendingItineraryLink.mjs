// src/lib/pendingItineraryLink.mjs
//
// Module-level stash for a shared-itinerary deep link that arrives while the
// navigator is NOT mounted — i.e. the app is sitting on the auth / onboarding gate.
// Plain ESM (.mjs) with a colocated .d.ts, like parseItineraryLink, so `node --test`
// can execute it on CI.
//
// useVenueLinkCapture (mounted at the App root, above the gate) writes the URL
// here; once AppNavigator mounts, useItineraryDeepLink consumes it and opens the
// itinerary.
//
// Why it matters: a warm link delivered at the gate has no listener to route it
// (useItineraryDeepLink lives inside the navigator) and is not the app's initial
// URL, so without this stash it is simply lost. The person finishes onboarding on
// the default screen, never sees the itinerary, and its author gets no touch.
//
// The catch: when the navigator IS mounted, the root capture hook and
// useItineraryDeepLink both hear the same URL, in an order React does not
// promise. If the stash kept a URL the navigator had already routed, it would
// replay the next time the navigator remounts (sign out, sign back in). So the
// router reports what it handled, and a URL handled moments ago is neither kept
// nor accepted — whichever of the two hooks runs first.

/** How long a just-routed URL is refused by the stash. Both hooks hear one link
 *  within the same tick (warm) or the same launch (cold); 5s covers either. */
export const HANDLED_WINDOW_MS = 5000;

let pending = null;
let lastHandledUrl = null;
let lastHandledAt = 0;

/** Stash an itinerary deep-link URL to be routed once the navigator is mounted. */
export function setPendingItineraryLink(url, now = Date.now()) {
  if (url === lastHandledUrl && now - lastHandledAt < HANDLED_WINDOW_MS) return;
  pending = url;
}

/** Return and clear the stashed itinerary deep-link URL (null if none). */
export function takePendingItineraryLink() {
  const url = pending;
  pending = null;
  return url;
}

/** The navigator routed this URL itself: drop a matching stash and refuse it briefly. */
export function markItineraryLinkHandled(url, now = Date.now()) {
  lastHandledUrl = url;
  lastHandledAt = now;
  if (pending === url) pending = null;
}
