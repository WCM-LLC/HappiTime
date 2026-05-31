// src/hooks/useVenueDeepLink.ts
//
// Routes venue QR deep links into the app. The web bridge (happitime.biz/v/{slug})
// records the visit, then opens happitime://venue/{slug}?src=qr. This hook catches
// that URL (cold start + foreground), resolves the slug to a venueId, and opens the
// venue screen with a one-shot "Checked in!" banner.
//
// Display-only: attribution was already recorded by the web bridge (source=qr), so
// we deliberately do NOT re-fire track-visit here (the app uses a different session
// id than the web, so a second call would double-count the same scan).
//
// Mirrors useNotificationNavigation / useMagicLinkListener (manual expo-linking
// listeners + navigationRef), since the app does not use NavigationContainer linking.

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { supabase } from "../api/supabaseClient";
import { parseVenueLink } from "../lib/parseVenueLink";

// On cold start the deep link can arrive before the navigator is mounted. Poll
// isReady briefly so the primary (app-launched-by-link) case isn't dropped.
async function waitForNav(
  navigationRef: React.RefObject<any>,
  timeoutMs = 3000,
): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const nav = navigationRef.current;
    if (nav?.isReady?.()) return nav;
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 100));
  }
  return null;
}

export function useVenueDeepLink(navigationRef: React.RefObject<any>) {
  useEffect(() => {
    let cancelled = false;

    async function handleUrl(url: string) {
      const parsed = parseVenueLink(url);
      if (!parsed) return; // not a venue link (e.g. auth/...) — ignore
      try {
        const { data, error } = await supabase
          .from("venues")
          .select("id")
          .eq("slug", parsed.slug)
          .maybeSingle();
        if (cancelled || error || !data?.id) return;
        const nav = await waitForNav(navigationRef);
        if (cancelled || !nav) return;
        nav.navigate("VenuePreview", {
          venueId: data.id as string,
          fromScan: parsed.src === "qr",
        });
      } catch {
        // Never block the app open on a failed resolve.
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [navigationRef]);
}
