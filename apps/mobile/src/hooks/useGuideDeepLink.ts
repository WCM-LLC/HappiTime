// src/hooks/useGuideDeepLink.ts
//
// Routes guide deep links (https://happitime.biz/guides/{slug}/ and
// happitime://guides/{slug}) to the GuideDetail screen. Mirrors
// useItineraryDeepLink: manual expo-linking listeners + navigationRef. The screen
// fetches the guide by slug itself, so this only routes.

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { parseGuideLink } from "../lib/parseGuideLink";

async function waitForNav(navigationRef: React.RefObject<any>, timeoutMs = 5000): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const nav = navigationRef.current;
    if (nav?.isReady?.()) return nav;
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 100));
  }
  return null;
}

export function useGuideDeepLink(navigationRef: React.RefObject<any>) {
  useEffect(() => {
    let cancelled = false;

    async function handleUrl(url: string) {
      const parsed = parseGuideLink(url);
      if (!parsed) return;
      const nav = await waitForNav(navigationRef);
      if (cancelled || !nav) return;
      nav.navigate("GuideDetail", { slug: parsed.slug });
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
