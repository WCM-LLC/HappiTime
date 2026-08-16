# Venue Event Times — UTC render bug FIXED (2026-08-16)

**Supersedes "Bug 3" of `VENUE-EVENTS-FIX-SPEC-2026-08-11.md`.** That spec was
correct and was not fully implemented: its recurrence half ("Every Monday")
shipped, its timezone half did not. Five days later every event on the site was
still five hours late. This document records the fix and the guard that now
prevents a repeat.

## What was wrong

`venue_events.starts_at` / `ends_at` are `timestamptz` — instants. The venue
page formatted them with bare `toLocaleDateString()` / `toLocaleTimeString()`
calls, no `timeZone` option, so output used the **runtime** zone. On Vercel that
is UTC.

**The database was correct.** Every row carries a correct instant and a
`timezone` column set to `America/Chicago`. Only the display was wrong. Nothing
was fixed by editing timestamps, and nothing should be.

## Blast radius (measured, not estimated)

Of **179 published events**:

| | Count |
|---|---|
| Rendered at the **wrong time** | **179 / 179** |
| Rendered on the **wrong calendar day** | **73 / 179** |

The day rollover hit nightlife hardest — anything from 7 PM CT onward crossed
midnight UTC:

| Venue | Event | Showed as | Actually |
|---|---|---|---|
| Club Casablanca | Ne-Yo | Sat 2:00 AM | **Fri 9:00 PM** |
| Aura | Aura Fridays | Sat 3:00 AM | **Fri 10:00 PM** |
| B.B.'s Lawnside | Live Blues Nightly | Sun 12:00 AM | **Sat 7:00 PM** |
| Brooksider | Reverse Happy Hour | Fri 2:00 AM | **Thu 9:00 PM** |
| Ragazza | Sunday Vinyl Sunday | Sun 5:00 PM | **Sun 12:00 PM** |

A customer reading the Ne-Yo listing was told to show up five hours after the
doors. "Venue-confirmed" is the brand claim; this contradicted it on every page.

## The fix

**Root cause was upstream of the render:** `apps/directory`'s `VenueEvent` type
and all three `venue_events(...)` selects omitted the `timezone` column, so the
correct zone was never fetched. The right fix was literally not reachable from
the render code. That is fixed first.

| File | Change |
|---|---|
| `apps/directory/src/lib/kcTime.mjs` | Added `formatEventDate` / `formatEventTime` / `formatEventTimeRange`. All pass `timeZone`; default `America/Chicago`. Types in `kcTime.d.ts`. |
| `apps/directory/src/lib/queries.ts` | Added `timezone` to `VenueEvent`, to `shapeVenue()`, and to all **3** `venue_events(...)` selects. |
| `apps/directory/.../[slug]/page.tsx` | Uses the shared formatters with `ev.timezone ?? KC_TZ`. |
| `apps/web/.../orgs/[orgId]/venues/[venueId]/page.tsx` | Owner console — `timezone` was already on the row type; now passed to all three format calls. |
| `apps/web/.../ScheduledEventsPopout.tsx` | Threads `timezone` through `formatTime` + the date call. Added `timezone` to `ScheduledPreviewEvent` and to the mapper in its parent page. |
| `apps/mobile/src/lib/eventDisplay.ts` | `formatEventDate` / `formatRecurrenceRule` take a `timeZone`; added `formatEventTime`. Device zone is no longer trusted. |
| `apps/mobile/src/hooks/useVenueEvents.ts`, `useUpcomingEvents.ts` | Select and type `timezone`. |
| `apps/mobile/.../EventCalendarScreen`, `VenueEventsScreen`, `VenuePreviewScreen` | 4 inline bare `ends_at` calls replaced; zone threaded through. |

Mobile was wrong by a different mechanism — it used the *device* zone, so it
looked right in KC and wrong for anyone travelling. Same fix.

## Why it will not happen again

`test/event-time-timezone.test.mjs` (11 tests, wired into `npm test` → CI):

1. **Behavioural** — asserts KC output for known instants, including an 8 PM CT
   event that UTC would roll to the next day, and a January date so a hardcoded
   `-5` offset fails. Explicitly asserts the formatter does **not** agree with
   the UTC rendering that shipped.
2. **Repo-wide static scan** — walks `apps/{directory,web,mobile}/src`, finds any
   `toLocale*String(` call lacking `timeZone` whose receiver is an event
   timestamp, and fails with file:line. This is the rule the 8/11 prose spec was
   trying to enforce.
3. **Formatter self-check** — asserts `kcTime.mjs`'s own formatters still contain
   `timeZone`. Needed because the behavioural tests would pass *coincidentally*
   if CI ever ran in Central time.
4. **Query guard** — every `venue_events(...)` select that pulls `starts_at` must
   also pull `timezone`, so the root cause cannot silently return.

**Verified by mutation testing**, not just by passing:

- Dropping `timeZone` from `kcTime` → 2 failures *even with `TZ=America/Chicago`*.
- Reintroducing one bare call on the venue page → 1 failure, named file:line.
- Restored → 11/11 pass.

Full suite: **569 tests, 0 failures**. `tsc --noEmit` clean on directory, web,
and mobile.

## Data hygiene applied while in here

- Ragazza had the same Monday industry-night event published **twice** (two rows,
  same RRULE). Drafted the duplicate; kept the row whose `price_info` carries the
  accurate "(arts & service industry)" qualifier.
- **Beer Kitchen** (venue `archived`, `CLOSED_TEMPORARILY` since Aug 9) still had
  a published recurring "Music Bingo". Drafted it.

## Still open — for Builder

- **Up-Down KC** (2 events) and **Black Garlic** (1) are `status='draft'` venues
  carrying **published** events. They don't surface today because venue status
  gates the page, but the state is contradictory. Worth a DB constraint or a
  cascade: a venue leaving `published` should draft its events. The Beer Kitchen
  case shows this is a repeating pattern, not a one-off.
- **Bugs 1 and 2 of the 8/11 spec** (past one-offs shown under "Upcoming"; no
  date filter/ordering on the three selects) are **not** addressed here. This
  pass was scoped to the timezone defect. Bug 1 in particular is still live —
  the section is titled "Upcoming Events" and shows past one-offs.
- `apps/directory` is **not** in the root `lint` script (`web`, `mobile`,
  `android` only). The public site is the least-linted app in the repo.
