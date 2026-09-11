// src/hooks/useNotificationNavigation.ts
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { resolveNotificationTarget } from "../lib/notificationTarget";

// The navigator may still be mounting (e.g. just left the auth gate). Poll
// isReady briefly so the tap isn't dropped. Same pattern as useVenueDeepLink /
// useCheckinPrimeHandoff — on cold start the tap response arrives while App.tsx
// is still walking its boot gates, well before NavigationContainer is ready.
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

/**
 * Handles notification deep linking. Payload routing lives in
 * lib/notificationTarget.mjs (data.type → screen/params).
 */
export function useNotificationNavigation(
  navigationRef: React.RefObject<any>
) {
  // De-dupes between the warm listener and the cold-start fetch, which can
  // both deliver the same response. Marked at dispatch time (before the nav
  // poll) so the two paths can't double-navigate; waitForNav then rides out
  // the boot gates instead of bailing.
  const lastHandledId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const handleResponse = async (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (lastHandledId.current === id) return;

      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const target = resolveNotificationTarget(data);
      if (!target) return; // not ours (e.g. visit_rating) — leave for other hooks

      lastHandledId.current = id;
      const nav = await waitForNav(navigationRef);
      if (cancelled) return;
      if (!nav) {
        console.warn("[useNotificationNavigation] navigator never became ready; tap dropped:", target.screen);
        return;
      }
      nav.navigate(target.screen as any, target.params as any);
    };

    // Handle taps while the app is running
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);

    // Handle cold-start — user tapped a notification to open the app
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [navigationRef]);
}
