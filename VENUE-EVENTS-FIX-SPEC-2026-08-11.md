# Venue Events Display — Fix Spec (2026-08-11)

> **PARTIALLY SUPERSEDED 2026-08-16.** Bug 3 (times render in server TZ) is
> **FIXED** — see `VENUE-EVENTS-TZ-FIX-2026-08-16.md`, now guarded by
> `test/event-time-timezone.test.mjs`. Bug 2's recurrence labels shipped.
> **Bug 1 (no date filter/ordering — past one-offs under "Upcoming") is still
> open**, as is the Events section/button feature below.
>
> Note for future specs: Bug 2 shipped and Bug 3 did not, from the same
> document, and nothing caught it for five days while every event on the site
> displayed five hours late. Prose specs don't hold; land the test with the fix.

**From:** Growth (Marketing Council) · **For:** Builder · **Priority: HIGH** — public venue pages currently show stale/past events labeled "Upcoming," with wrong times. This is a trust problem: "venue-confirmed" is the brand claim and the events section contradicts it.

**Repro:** happitime.biz venue page for `vine-street-brewing` — shows 7 past July one-offs (World Cup watches 7/18–19, Bingo 7/16, Rob Trib 7/12 + 7/26, Run Club 7/20) under "Upcoming Events," and its two live recurring events (Jazz Jam Wed, POC M-I-C Mon) render as past June dates at UTC times.

Related: the 8/5 scaffold `.superpowers/sdd/2026-08-05-venue-events-page/` is an EMPTY folder — the Events page/button discussed then was never spec'd or built. This document replaces it. The UTC time bug below is the same one flagged 8/6 (Voltaire) — still open.

---

## Bug 1 — No date filter or ordering on venue_events

`apps/directory/src/lib/queries.ts` — all three selects that embed `venue_events(...)` (≈L278 neighborhood query, ≈L307 `getVenueBySlug`, ≈L380 map/list query) filter only `venue_events.status = 'published'`.

Fix in `getVenueBySlug` (and mirror in the other two, which power VenueCard "N events" badges and the map's today-filter):

- Keep an event if **either**:
  - one-off (`is_recurring = false`) and `coalesce(ends_at, starts_at) >= now() - interval '3 hours'` (grace so tonight's event survives through closing), **or**
  - `is_recurring = true` **and not expired**: `ends_at is null or ends_at >= now()` (note: recurring rows use `ends_at` as series end — e.g. POC M-I-C ends 9/16).
- Simplest implementation: PostgREST `.or(...)` on the embedded resource, or filter in `shapeVenue()` after fetch (data volumes are tiny — in-JS filter is fine and keeps one code path).
- Sort: recurring-next-occurrence / one-off `starts_at` ascending (compute next occurrence per Bug 2, then sort by that).

## Bug 2 — Recurring events render first-occurrence date

`apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx` ≈L393–408 prints `new Date(ev.starts_at)` for every event.

Fix: when `is_recurring && recurrence_rule` matches `FREQ=WEEKLY;BYDAY=XX`:
- Display "**Every Monday**" (map BYDAY → weekday; multiple days = "Mon & Wed") instead of the date.
- Time still comes from `starts_at` (it encodes the local start time) — but see Bug 3.
- Compute **next occurrence** for sorting and for an optional "next: Mon Aug 17" sub-label.
- `apps/web/src/app/app-preview/.../ScheduledEventsPopout.tsx` already has the `RRULE_DAYS` map + labels — lift that logic into a shared util (`apps/directory/src/lib/recurrence.ts`) rather than re-writing it.

## Bug 3 — Times render in server TZ (UTC)

Same file, ≈L395–403: `toLocaleDateString`/`toLocaleTimeString` called without `timeZone`. On Vercel that's UTC → "Office Hours" Jazz Jam shows "Thu Jun 18, 12:00 AM" instead of Wed 7:00 PM.

Fix: pass `{ timeZone: event.timezone ?? "America/Chicago" }` to BOTH calls. Grep the directory app for other bare `toLocale*` calls on DB timestamps while in there — the 8/6 Voltaire report hit this on event display too; fix all instances in one pass.

## Feature — Events section + button (the "as discussed" part)

Minimum ship (this pass):
1. Venue page section becomes two groups: **"Weekly at {venue}"** (recurring) then **"Upcoming"** (future one-offs, max 5 + "See all"). Section hides only when both are empty.
2. **Events button**: in the venue-page action row (call / website / directions), add "Events" that anchor-scrolls to the section (`#events`). Only render when events exist.
3. Port `ScheduledEventsPopout` from app-preview into `apps/directory` for the "See all" overflow (>5 upcoming) — it's already built and styled; wire it to the same shaped events.

Explicitly OUT of scope: standalone `/events` route, calendar view, ticketing. Don't overbuild — this unblocks the daily-content loop (we insert verified events per PLAYBOOK §1c and they currently display wrong).

## Acceptance (test on vine-street-brewing)

- [ ] No past one-offs anywhere on the page (July events gone).
- [ ] Jazz Jam shows "Every Wednesday · 7:00 PM" (CT), POC M-I-C "Every Monday · 7:00 PM" until 9/16, then disappears.
- [ ] Recurring test data now live on `brooksider-sports-bar-grill` (6 venue-published weekly specials inserted 8/11) — its page should show all six as "Weekly," correctly timed CT. NOTE: do NOT seed events on VSB — it's owner-assigned, and per J's 8/11 rule scraped/manual events only go to venues with zero `org_members`; owner venues get a nudge instead. VSB currently has zero published windows AND (soon) expiring events — also use it to verify the section/button hide correctly on empty.
- [ ] Events button appears, scrolls to section; hidden on venues with zero live events.
- [ ] VenueCard "N events" badge counts only live events (same filter), so cards stop advertising dead events.
- [ ] JSON-LD check: if event schema is emitted anywhere, dates must use the corrected TZ.

**DB note (growth already handled today):** no schema changes needed. Recurring rows follow PLAYBOOK §1c conventions (`recurrence_rule`, `timezone='America/Chicago'`, real first occurrence in `starts_at`).
