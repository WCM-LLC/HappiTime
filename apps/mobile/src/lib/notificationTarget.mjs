// Maps a push notification's data payload to a navigation target.
// Pure ESM (like parseVenueLink.mjs) so `node --test` can import it directly;
// types live in the notificationTarget.d.ts sidecar.
//
// Payload contract (kept in sync with supabase/functions/notify-*/index.ts):
//   happy_hour → { windowId }   venue → { venueId }   itinerary → { listId }
//   friend → (none)             event → { venueId, eventId }
// visit_rating is deliberately NOT routed here — useVisitRating owns it
// (opens the rating modal instead of navigating).
export function resolveNotificationTarget(data) {
  if (!data || typeof data !== "object") return null;
  const type = data.type;

  if (type === "happy_hour" && typeof data.windowId === "string") {
    return { screen: "HappyHourDetail", params: { windowId: data.windowId } };
  }
  if (type === "venue" && typeof data.venueId === "string") {
    return { screen: "VenuePreview", params: { venueId: data.venueId } };
  }
  if (type === "friend") {
    return { screen: "AppTabs", params: { screen: "Activity" } };
  }
  if (type === "itinerary" && typeof data.listId === "string") {
    return { screen: "ItineraryDetail", params: { listId: data.listId } };
  }
  if (type === "event") {
    // EventCalendar takes no params (navigation/types.ts); the calendar
    // surfaces the upcoming event the push was about.
    return { screen: "EventCalendar", params: undefined };
  }
  return null;
}
