// Expo web (`npm run web`) build of heycatchSdk.ts. Metro resolves
// `@heycatch/sdk` to the browser entry here, whose `analytics` has init,
// identity and trackEvent but no trackScreen, and which exports no
// HeyCatchProvider. This fills both gaps with the same shape the native
// module exports, so App.tsx and lib/heycatch.ts run unchanged on web.
import type { ReactNode } from "react";
import { analytics as browserAnalytics } from "@heycatch/sdk";
import type { HeyCatchProperties } from "@heycatch/sdk";

export type { HeyCatchProperties };

// Delegates to the browser analytics object through its prototype (not a
// spread copy), so every SDK method still runs against the original object.
export const analytics = Object.assign(Object.create(browserAnalytics), {
  // The browser build autocaptures pageviews from URL changes, but React
  // Navigation on web changes screens without them — report screens as events.
  trackScreen(name: string, properties?: HeyCatchProperties) {
    browserAnalytics.trackEvent("screen_view", { ...properties, screen: name });
  },
}) as typeof browserAnalytics;

/** The browser build autocaptures clicks itself; nothing to provide. */
export function HeyCatchProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
