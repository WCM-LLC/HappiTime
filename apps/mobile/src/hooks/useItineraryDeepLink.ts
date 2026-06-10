// src/hooks/useItineraryDeepLink.ts
//
// Routes shared-itinerary deep links into the app. The web viewer is served at
// https://happitime.biz/i/{token}; with Universal Links (associatedDomains +
// /.well-known/apple-app-site-association) an installed app opens that URL directly
// instead of Safari. This hook catches it (cold start + foreground), and also the
// custom-scheme form happitime://itinerary?token={token}, and opens the read-only
// SharedItinerary screen. The screen itself resolves the token via the
// get_shared_itinerary RPC, so this hook only needs to route — no data fetch here.
//
// Mirrors useVenueDeepLink: manual expo-linking listeners + navigationRef, since the
// app does not use NavigationContainer linking. Non-itinerary URLs are ignored, so
// the venue and auth listeners are unaffected.

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { parseItineraryLink } from "../lib/parseItineraryLink";

async function waitForNav(
  navigationRef: React.RefObject<any>,
  timeoutMs = 5000,
): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const nav = navigationRef.current;
    if (nav?.isReady?.()) return nav;
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 100));
  }
  return null;
}

export function useItineraryDeepLink(navigationRef: React.RefObject<any>) {
  useEffect(() => {
    let cancelled = false;

    async function handleUrl(url: string) {
      const parsed = parseItineraryLink(url);
      if (!parsed) return; // not an itinerary link — ignore
      const nav = await waitForNav(navigationRef);
      if (cancelled || !nav) return;
      nav.navigate("SharedItinerary", { token: parsed.token });
    }

    // Cold start
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Foreground
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [navigationRef]);
}
