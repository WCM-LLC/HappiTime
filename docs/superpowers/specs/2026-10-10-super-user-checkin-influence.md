# Super User Check-in Influence Attribution — Design

**Status:** Database layer in this PR. Mobile logging calls and dashboard tiles are follow-ups (below).
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
| `itinerary_view` | `record_itinerary_touch(list_id)` | yes |
| `itinerary_venue_tap` | `record_itinerary_touch(list_id, venue_id)` | yes |

One row per (user, Insider, venue, kind) per UTC day.

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

## Follow-ups (not in this PR)

1. **Mobile:** call `record_itinerary_touch(listId)` when `ItineraryDetailScreen` /
   `SharedItineraryScreen` opens a list the viewer does not own, and
   `record_itinerary_touch(listId, venueId)` on venue press. Fire-and-forget; the RPC is a no-op
   for non-Insider lists.
2. **Web:** add influenced check-ins / new faces / venues to `/dashboard/referrals` and
   `/admin/users`; per-venue table from `super_user_venue_influence`.
3. **Later, if volume justifies it:** venue-facing "Insiders who sent you guests" line, a
   guide→venue mapping, payout rules.
