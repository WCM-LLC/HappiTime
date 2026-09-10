// src/hooks/useActivityDeepLink.ts
//
// Routes Activity-tab deep links into the app. App Store marketing surfaces
// (e.g. the in-app-event deep link field) point at happitime://activity, which
// opens the Activity tab — home of the 1.0.8 notifications inbox — optionally
// on a specific segment (happitime://activity?segment=friends).
//
// Mirrors useItineraryDeepLink: manual expo-linking listeners + navigationRef
// (cold start + foreground), since the app does not use NavigationContainer
// linking. Non-activity URLs are ignored, so the venue/itinerary/auth listeners
// are unaffected. If the user is signed out (Welcome gate), AppNavigator isn't
// mounted and the link is intentionally dropped — the inbox is user-scoped.

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { parseActivityLink } from "../lib/parseActivityLink";

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

export function useActivityDeepLink(navigationRef: React.RefObject<any>) {
  useEffect(() => {
    let cancelled = false;

    async function handleUrl(url: string) {
      const parsed = parseActivityLink(url);
      if (!parsed) return; // not an activity link — ignore
      const nav = await waitForNav(navigationRef);
      if (cancelled || !nav) return;
      nav.navigate("AppTabs", {
        screen: "Activity",
        params: parsed.segment ? { segment: parsed.segment } : undefined,
      });
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
