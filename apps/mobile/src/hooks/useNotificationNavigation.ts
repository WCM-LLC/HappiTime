// src/hooks/useNotificationNavigation.ts
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";

/**
 * Handles notification deep linking.
 *
 * Notification payloads should include a `data` object with:
 *   - type: "happy_hour" | "venue" | "friend" | "general"
 *   - windowId?: string   (for happy_hour type)
 *   - venueId?: string    (for venue type)
 *   - tab?: string        (for friend → Activity, general → Home)
 */
export function useNotificationNavigation(
  navigationRef: React.RefObject<any>
) {
  const lastHandledId = useRef<string | null>(null);

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (lastHandledId.current === id) return;
      lastHandledId.current = id;

      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      if (!data) return;

      const nav = navigationRef.current;
      if (!nav?.isReady()) return;

      const type = data.type as string | undefined;

      if (type === "happy_hour" && typeof data.windowId === "string") {
        nav.navigate("HappyHourDetail", { windowId: data.windowId });
      } else if (type === "venue" && typeof data.venueId === "string") {
        nav.navigate("VenuePreview", { venueId: data.venueId });
      } else if (type === "friend") {
        // Navigate to Activity tab
        nav.navigate("AppTabs" as any, { screen: "Activity" } as any);
      }
    };

    // Handle taps while the app is running
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);

    // Handle cold-start — user tapped a notification to open the app
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    return () => subscription.remove();
  }, [navigationRef]);
}
