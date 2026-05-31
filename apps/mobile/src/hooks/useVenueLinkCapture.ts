// src/hooks/useVenueLinkCapture.ts
//
// Top-level (always-mounted) capture for venue QR deep links. It runs at the App
// root — ABOVE the auth / "Welcome" gate — so a cold-start scan isn't dropped
// before AppNavigator (which hosts useVenueDeepLink) mounts.
//
// It does NOT navigate (no navigator exists yet at the gate). It stashes the URL
// and calls onVenueLink so the app can leave the gate (enter guest mode). Once
// AppNavigator mounts, useVenueDeepLink consumes the stash and routes.

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { parseVenueLink } from "../lib/parseVenueLink";
import { setPendingVenueLink } from "../lib/pendingVenueLink";

export function useVenueLinkCapture(onVenueLink: () => void) {
  useEffect(() => {
    function handle(url: string) {
      if (!parseVenueLink(url)) return; // ignore non-venue links (e.g. auth/...)
      setPendingVenueLink(url);
      onVenueLink();
    }

    Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, [onVenueLink]);
}
