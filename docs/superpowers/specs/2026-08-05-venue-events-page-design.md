# Per-Venue Events & Specials Page + Menus Tap Copy

**Date:** 2026-08-05
**Status:** Approved (owner, 2026-08-05)

## Problem

1. Event-card "More info" links (Event Calendar screen, Venue Preview events section) call `Linking.openURL(ev.external_url)`, bouncing users to the venue's website. The owner wants a per-venue page inside the app where the venue's recurring specials and events live, and "More info" should lead there.
2. Venue Preview's "Tap below to see Menus" subtitle sits above the check-in buttons, but the actual menu tap targets are the happy-hour window cards further down (they open `HappyHourDetail`). Users tap the wrong thing.

## Decisions (owner)

- New per-venue **Events & Specials** page; "More info" on Event Calendar cards routes there.
- Venue Preview's inline events section caps at 3 cards + a "See all events & specials" link to the page.
- "Get tickets" (`ticket_url`) stays external everywhere.
- Venue websites stay reachable via a secondary "Visit website" action on the page's rows — never as "More info".
- Event push/inbox notifications route to the venue's page (payload carries `venueId`), calendar fallback for old payloads.
- Menus copy: "Tap here to see menus", placed directly above the happy-hour window cards.

## Design

### New screen: `apps/mobile/src/screens/VenueEventsScreen.tsx`

Route `VenueEvents: { venueId: string; venueName?: string }` in `RootStackParamList`, registered with the other stack screens in the app navigator. Uses the existing `useVenueEvents(venueId)` hook unchanged (published, recurring OR future-dated, limit 20). Layout, following existing screen idioms (`colors`/`spacing` tokens, loading spinner):

- Title: `venueName` param when present, else "Events & Specials".
- Group 1 — **"Recurring specials & events"**: rows where `is_recurring`, date line via the existing `formatRecurrenceRule`.
- Group 2 — **"Upcoming"**: dated rows, formatted like the calendar card (start date + optional end time).
- Row content: event-type badge (`EVENT_TYPE_LABELS`), title, price info, **untruncated** description, then actions: "Get tickets" (external, when `ticket_url`) and "Visit website" (external, when `external_url`), both `Linking.openURL`.
- Empty state: "No published events or specials yet."

`EVENT_TYPE_LABELS` and `formatRecurrenceRule` currently live module-private in `EventCalendarScreen.tsx`; move them to `apps/mobile/src/lib/eventDisplay.ts` (new, pure) and import from both screens — no behavior change.

### Rewiring

- **Event Calendar card**: "More info" → `navigation.navigate("VenueEvents", { venueId: ev.venue_id, venueName })`. Rendered for every event (no longer gated on `external_url`). "Get tickets" unchanged.
- **Venue Preview events section**: render `events.slice(0, 3)`; when `events.length > 0`, a "See all events & specials →" link (below the cards) navigates to `VenueEvents`. Inline cards drop the "More info" website link; keep "Get tickets".
- **`resolveNotificationTarget`** `event` branch: when `data.venueId` is a string → `{ screen: "VenueEvents", params: { venueId } }`; else the existing `EventCalendar` fallback. (`notificationTarget.mjs` may be edited here; the "do not edit" constraint belonged to the inbox plan's zero-new-routing scope, which shipped.)

### Menus copy

In `VenuePreviewScreen.tsx`: remove the "Tap below to see Menus" subtitle from above the check-in buttons; render "Tap here to see menus" (same `subtitle` style) directly above the happy-hour windows list, only when `windowsForVenue.length > 0`.

## Testing

- Static guards in the repo suite (`node --test test/*.test.mjs`, Node 20):
  - Event Calendar and Venue Preview cards no longer call `Linking.openURL(ev.external_url)`; calendar "More info" navigates to `VenueEvents`.
  - Resolver `event` branch routes to `VenueEvents` with the `EventCalendar` fallback intact.
  - Venue Preview renders the menus copy "Tap here to see menus" adjacent to the windows list render, and the old "Tap below" string is gone.
- `npx tsc --noEmit` clean from `apps/mobile`.
- No backend changes; `upcoming-push-schedule.test.mjs` sender guards untouched.

## Rollout

JS-only → OTA against runtime 1.0.8 (first OTA-capable build) per `docs/ota-runbook.md`: `--environment production`, preview channel + device verify, then promote to branch `master`. Phones on 1.0.6 receive it when they update to 1.0.8. No schema or native changes.

## Out of scope

- Web (directory) equivalents.
- Event images, sharing, calendar-add, or per-event detail screens.
- Any change to `HappyHourDetail` itself.
