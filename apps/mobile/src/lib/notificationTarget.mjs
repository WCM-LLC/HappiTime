// Maps a push notification's data payload to a navigation target.
// Pure ESM (like parseVenueLink.mjs) so `node --test` can import it directly;
// types live in the notificationTarget.d.ts sidecar.
//
// Payload contract (kept in sync with supabase/functions/notify-*/index.ts):
//   happy_hour → { windowId }   venue → { venueId }   itinerary → { listId }
//   friend → (none)             event → { venueId, eventId } (routes to the
//     venue's VenueEvents page; falls back to EventCalendar without venueId)
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
    // Owner decision (2026-08-04): follower notifications land on the Friends
    // segment, where accept/decline lives — not the default Notifications one.
    return { screen: "AppTabs", params: { screen: "Activity", params: { segment: "friends" } } };
  }
  if (type === "itinerary" && typeof data.listId === "string") {
    return { screen: "ItineraryDetail", params: { listId: data.listId } };
  }
  if (type === "event") {
    // Land on the venue's in-app Events & Specials page when the payload
    // carries the venue; old payloads fall back to the calendar.
    if (typeof data.venueId === "string") {
      return { screen: "VenueEvents", params: { venueId: data.venueId } };
    }
    return { screen: "EventCalendar", params: undefined };
  }
  return null;
}
