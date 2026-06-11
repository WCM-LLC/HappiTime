// src/hooks/useVenueLinkCapture.ts
//
// Top-level (always-mounted) capture for venue QR deep links. It runs at the App
// root — ABOVE the auth / "Welcome" gate — so a cold-start scan isn't dropped
// before AppNavigator (which hosts useVenueDeepLink) mounts.
//
// It does NOT navigate (no navigator exists yet at the gate). It stashes the URL
// and calls onVenueLink so the app can leave the gate (enter guest mode). Once
// AppNavigator mounts, useVenueDeepLink consumes the stash and routes.
//
// Additionally: when a venue/itinerary link carries a ?ref= Insider handle, or
// when the URL is a bare /r/{handle} referral link, the handle is stashed in
// pendingReferral for useReferralCapture to record on the first signed-in session.
// A bare referral link does NOT trigger onVenueLink — the user stays on the
// Welcome prompt (sign-in is required to record the attribution).

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { parseVenueLink } from "../lib/parseVenueLink";
import { parseItineraryLink } from "../lib/parseItineraryLink";
import { parseReferralLink } from "../lib/parseReferralLink";
import { setPendingVenueLink } from "../lib/pendingVenueLink";
import { setPendingReferral } from "../lib/pendingReferral";

export function useVenueLinkCapture(onVenueLink: () => void) {
  useEffect(() => {
    function handle(url: string) {
      // Venue link — stash for routing and stash ref if present.
      const venue = parseVenueLink(url);
      if (venue) {
        if (venue.ref) void setPendingReferral(venue.ref);
        setPendingVenueLink(url);
        onVenueLink();
        return;
      }

      // Itinerary link — stash ref if present (routing handled by useItineraryDeepLink).
      const itinerary = parseItineraryLink(url);
      if (itinerary) {
        if (itinerary.ref) void setPendingReferral(itinerary.ref);
        return;
      }

      // Bare referral link (/r/{handle} or happitime://referral/{handle}) — stash
      // the handle only; do NOT call onVenueLink (user must sign in to record it).
      const referral = parseReferralLink(url);
      if (referral) {
        void setPendingReferral(referral.handle);
        return;
      }

      // All other URLs (e.g. auth/...) are ignored.
    }

    Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, [onVenueLink]);
}
