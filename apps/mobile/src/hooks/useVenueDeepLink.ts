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
//
// The cold-start / gated URL is captured above the auth gate by useVenueLinkCapture
// and stashed (pendingVenueLink); this hook consumes that stash on mount. It also
// listens for warm links that arrive while the navigator is already mounted.

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { supabase } from "../api/supabaseClient";
import { parseVenueLink } from "../lib/parseVenueLink";
import { takePendingVenueLink } from "../lib/pendingVenueLink";

// The navigator may still be mounting (e.g. just left the auth gate). Poll
// isReady briefly so the link isn't dropped.
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
        if (cancelled) return;
        if (error || !data?.id) {
          console.warn("[useVenueDeepLink] no venue for slug:", parsed.slug, error?.message ?? "");
          return;
        }
        const nav = await waitForNav(navigationRef);
        if (cancelled || !nav) return;
        nav.navigate("VenuePreview", {
          venueId: data.id as string,
          fromScan: parsed.src === "qr",
        });
      } catch (e) {
        // Never block the app open on a failed resolve.
        console.warn("[useVenueDeepLink] resolve failed:", e);
      }
    }

    // Consume a link captured before the navigator mounted (cold start / gate).
    const pending = takePendingVenueLink();
    if (pending) handleUrl(pending);

    // Warm links arriving while the navigator is already mounted (e.g. a signed-in
    // user scans). Clear any stash so it can't replay on a later remount.
    const sub = Linking.addEventListener("url", ({ url }) => {
      takePendingVenueLink();
      handleUrl(url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [navigationRef]);
}
