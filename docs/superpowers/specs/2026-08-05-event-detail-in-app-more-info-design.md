# Event Detail: "More info" stays in-app

**Date:** 2026-08-05
**Status:** Approved (owner, 2026-08-05)

## Problem

On event cards — both the Event Calendar screen and the events section of Venue Preview — the "More info" link calls `Linking.openURL(ev.external_url)`, bouncing users out of the app to the venue's website. The owner wants event exploration to stay in-app; the website should be reachable but honestly labeled, not the primary "More info" destination.

## Decisions (owner)

- "More info" opens a new in-app **Event Detail** screen on both surfaces.
- "Get tickets" (`ticket_url`) stays an external link — ticket purchase genuinely lives off-app.
- The venue website remains reachable as a secondary "Visit website" action inside Event Detail.
- Event push/inbox notifications (`type: "event"`) route to Event Detail instead of the generic calendar — the payload already carries `eventId`.

## Design

### New screen: `apps/mobile/src/screens/EventDetailScreen.tsx`

Route `EventDetail: { eventId: string }` in `RootStackParamList`, registered alongside the other stack screens in the app navigator. Content, following existing screen idioms (loading spinner, `colors`/`spacing` tokens):

- Event-type badge (reuse `EVENT_TYPE_LABELS` mapping), title, price info.
- Full date line: recurrence rule (via the existing `formatRecurrenceRule`) or formatted start, plus end time — same formatting as the calendar card.
- **Untruncated** description.
- Venue row: name · neighborhood; tap → `VenuePreview { venueId }`.
- Actions: "Get tickets" (external, only when `ticket_url`), "Visit website" (external, only when `external_url`), both via `Linking.openURL`.
- Not-found / unpublished event: friendly empty state ("This event is no longer listed."), not a crash.

### New hook: `apps/mobile/src/hooks/useVenueEvent.ts`

`useVenueEvent(eventId)` mirrors `useUpcomingEvents`: same column select including the `venues(...)` embed, `.eq("id", eventId).eq("status", "published").maybeSingle()`, effective-tier override via `fetchEffectiveTiers`, `(supabase as any)` cast per repo convention (stale generated types). Returns `{ event, loading, error, refresh }`.

### Link rewiring

- `EventCalendarScreen` card and `VenuePreviewScreen` events section: "More info" → `navigation.navigate("EventDetail", { eventId: ev.id })`. The link renders for **every** event (no longer gated on `external_url` — every event has in-app detail). "Get tickets" on cards unchanged.
- `resolveNotificationTarget` `event` branch: when `data.eventId` is a string, return `{ screen: "EventDetail", params: { eventId } }`; otherwise fall back to `EventCalendar` (old pushes without the field keep working).

### Testing

- Static guards (repo suite, `test/*.test.mjs`): the two card surfaces navigate to `EventDetail` and no longer call `Linking.openURL(ev.external_url)`; the resolver's `event` branch routes to `EventDetail` with the calendar fallback intact.
- `npx tsc --noEmit` clean from `apps/mobile`.
- Existing `upcoming-push-schedule.test.mjs` literal-string guards on the sender are untouched (no backend changes).

## Rollout

JS-only → OTA-able against runtime 1.0.8 (the first OTA-capable build). Publish per `docs/ota-runbook.md`: `--environment production`, preview channel + device verify first, then promote to branch `master`. Devices on 1.0.6 receive it when they update to 1.0.8 from the store. No backend, schema, or native changes.

## Out of scope

- A web (directory) equivalent — this spec covers the mobile app only.
- Event images, sharing, or calendar-add actions on the detail screen (YAGNI until asked).
