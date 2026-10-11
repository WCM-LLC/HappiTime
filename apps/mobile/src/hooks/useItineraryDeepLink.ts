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
import {
  markItineraryLinkHandled,
  restorePendingItineraryLink,
  takePendingItineraryLink,
} from "../lib/pendingItineraryLink";

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
      if (cancelled || !nav) {
        // Not routed (navigator never became ready, or this hook unmounted during
        // an auth transition). Put it back so the next mount opens it, instead of
        // losing it silently — unless a newer link has arrived meanwhile.
        restorePendingItineraryLink(url);
        return;
      }
      nav.navigate("SharedItinerary", { token: parsed.token });
      // Only now — after the navigator has accepted it — tell the above-the-gate
      // stash this one is done, so the root capture hook (which hears the same
      // URL) cannot leave a copy to replay on a later remount.
      markItineraryLinkHandled(url);
    }

    // A link captured above the auth / onboarding gate, before this hook existed
    // to hear it (see pendingItineraryLink). Covers both a cold start and a warm
    // link delivered while gated.
    const pending = takePendingItineraryLink();
    if (pending) handleUrl(pending);

    // Cold start — only when nothing was stashed. A stashed link is the latest
    // thing the person tapped (it is the launch URL itself, or something newer
    // that arrived at the gate), so the launch URL must not be routed on top of it.
    Linking.getInitialURL().then((url) => {
      if (url && !pending) handleUrl(url);
    });

    // Foreground, navigator already mounted.
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [navigationRef]);
}
