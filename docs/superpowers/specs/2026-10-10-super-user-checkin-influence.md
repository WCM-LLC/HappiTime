# Super User Check-in Influence Attribution — Design

**Status:** Shipped — database and mobile in #247, dashboards in the follow-up PR.
**Date:** 2026-10-10
**Migration:** `supabase/migrations/20261011031500_super_user_checkin_influence.sql`
**Governing decision:** `OPTION_B_ATTRIBUTION_SPEC.md` — presence-based, in-app only, no MMP, no scan logging on `/r`.

## The gap

`super_user_traffic_summary` credits an Insider for every first check-in made by anyone they
**recruited** (`user_referrals`), at any venue, forever. Two consequences:

- It credits visits the Insider had nothing to do with.
- An existing user who acts on an Insider's itinerary earns that Insider nothing.

Neither supports the sentence we want to say to a venue: *"this tastemaker sent you N verified
check-ins."*

## The rule

A verified check-in earns at most one Insider one credit, stamped by trigger when the
`checkins` row is inserted.

1. **Venue touch.** The most recent touch for that user at that venue in the **7 days** before
   the check-in wins. The author must still be a `super_user`.
2. **Referral fallback.** No touch in the window, it is the user's **first** check-in at that
   venue, and they were referred before checking in → credit the referrer.
3. Otherwise no credit.

`basis` (`venue_touch` | `referral`) is stored on every credit so the two are never blurred.
`touch_kind` is stored too, so a weak signal (opened an itinerary) can be reported separately
from a strong one (tapped the venue, saved the itinerary).

## What counts as a touch

| Kind | Written by | Client change needed |
|---|---|---|
| `itinerary_save` | trigger on `super_user_credit_events` (already written by `copy_shared_itinerary`) | none — live on merge |
| `itinerary_view` | `record_itinerary_touch(list_id)` | wired in this PR — needs an app release |
| `itinerary_venue_tap` | `record_itinerary_touch(list_id, venue_id)` | wired in this PR — needs an app release |

One row per (user, Insider, venue, kind) per UTC day; a repeat the same day moves that row's
timestamp to now, so last-touch-wins holds within a day too.

**Not covered:** Guides. `guides.body_md` is free markdown with no venue link table, and the
directory guide pages are anonymous web. Crediting a guide needs a guide→venue mapping first.

## Decisions worth challenging

- **Insiders cannot read the row-level tables.** Both are presence data about other users
  (who looked at what, who checked in where). RLS is admin-only; dashboards read aggregates via
  the service client, as `/dashboard/referrals` already does.
- **Attribution never fails a check-in.** Both trigger functions swallow their own errors and
  `raise warning`. The cost is that a bug loses credits silently — watch Postgres logs.
- **Existing columns are untouched.** `first_checkins_driven`, `venues_touched` and
  `redemptions_driven` keep their recruited-traffic meaning; influence columns are appended.
- **Not tied to payouts.** A user can fabricate their own touches (never anyone else's), so the
  only way to game this is a real, code-verified check-in. Fine for reporting; revisit before
  money rides on it.

## Mobile wiring

`apps/mobile/src/api/itineraryTouch.ts` exposes `recordItineraryTouch(listId, venueId?)`,
fire-and-forget. `ItineraryDetailScreen` and `SharedItineraryScreen` call it once an itinerary
has loaded with venues on screen (a failed or abandoned load logs nothing) and when a venue row
is pressed. The helper does no filtering of its own: the RPC is a
no-op for the viewer's own lists and for lists that are not an Insider's. Venues opened from the
Map tab's itinerary banner are not logged separately — the open already touched every venue.

## Dashboards

- `/dashboard/referrals` (My QR): a "Your influence" block (influenced check-ins, new faces,
  venues, itinerary saves) plus the Insider's top venues, kept separate from "Your referrals".
  Counts only, self-filtered, read through the service client.
- `/admin/users`: an "Influenced" column. `/admin/users/[userId]`: influence tiles and a
  per-venue table from `super_user_venue_influence` splitting influence from referral credit.

## Follow-ups

1. **Later, if volume justifies it:** venue-facing "Insiders who sent you guests" line, a
   guide→venue mapping, payout rules.
