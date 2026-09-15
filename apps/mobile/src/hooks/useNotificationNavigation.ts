// src/hooks/useNotificationNavigation.ts
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { resolveNotificationTarget } from "../lib/notificationTarget";

// The navigator may still be mounting (e.g. just left the auth gate). Poll
// isReady briefly so the tap isn't dropped. Same pattern as useVenueDeepLink /
// useCheckinPrimeHandoff — on cold start the tap response arrives while App.tsx
// is still walking its boot gates, well before NavigationContainer is ready.
// 12s (was 5s): on a cold start the auth + boot gates can outlast 5s on older
// devices, in which case the tap was silently dropped and the app just opened
// to Home — reported 2026-09-14 as "sometimes it goes nowhere".
async function waitForNav(
  navigationRef: React.RefObject<any>,
  timeoutMs = 12000,
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
 * Where an OS push TAP lands. Different from where an inbox ROW tap lands.
 *
 * Decision 2026-09-14: a push tap opens the Notifications inbox, not the
 * deep-link target. Rationale — the push body ("Someone just scanned your QR
 * code at Tacos Valentina.") exists only in the OS banner and in the inbox;
 * VenuePreview / VenueEvents render nothing about it. Landing on the target
 * directly meant the user saw a venue with zero context and the inbox row
 * stayed unread. The inbox row's own tap still deep-links (ActivityScreen ->
 * resolveNotificationTarget), so the destination is one tap further, with
 * the message in between.
 *
 * `friend` keeps the owner's 2026-08-04 routing (Friends segment, where
 * accept/decline lives). visit_rating is not ours — useVisitRating owns it.
 */
function pushTapTarget(
  data: Record<string, unknown> | undefined,
  resolved: { screen: string; params?: unknown },
): { screen: string; params?: unknown } {
  if (data?.type === "friend") return resolved;
  return {
    screen: "AppTabs",
    params: { screen: "Activity", params: { segment: "notifications" } },
  };
}

/**
 * Handles notification deep linking. Payload routing lives in
 * lib/notificationTarget.mjs (data.type → screen/params); that resolver is
 * shared with the inbox and only used here to decide "is this ours".
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
      const resolved = resolveNotificationTarget(data);
      if (!resolved) return; // not ours (e.g. visit_rating) — leave for other hooks
      const target = pushTapTarget(data, resolved);

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
