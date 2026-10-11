# Making Guides Count Toward Insider Influence — Design

**Status:** In this PR.
**Date:** 2026-10-10
**Migration:** `supabase/migrations/20261011041500_guide_itineraries.sql`
**Builds on:** `2026-10-10-super-user-checkin-influence.md` (#247). **Governed by:** `OPTION_B_ATTRIBUTION_SPEC.md`.

## Why guides didn't count

Check-in credit needs two things a guide lacks:

1. **A venue.** `guides.body_md` is free markdown — there is no guide → venue table.
2. **A person.** Guides are read on the anonymous web. Option B rules out bridging a web reader
   to an app user with an MMP or install tracking.

## The idea: don't build a guide path, put guides on the itinerary path

Insiders already link venues in their guides (`happitime.biz/kc/<area>/<slug>`). On real data
(2026-10-10) every one of those links resolved to a published venue. So:

1. **Links are the mapping.** `guide_venue_slugs()` extracts the venue slugs a guide links to.
2. **A guide gets a companion itinerary.** `sync_guide_itinerary()` keeps a `user_lists` row
   (`source_guide_id = guide.id`) owned by the author, holding those venues in the order the guide
   mentions them. A trigger re-syncs on every guide write.
3. **The guide page sends readers into the app.** A "Take these N spots with you" card links to
   `/i/{share_token}?ref={author_handle}` — the same URL the app's share sheet makes.
4. **Everything after that already exists.** `/i/*` is a Universal/App Link, `SharedItineraryScreen`
   logs opens, venue taps and saves, and the check-in trigger credits the list owner — the author.

No new attribution rule, no new touch kind, no mobile change. A guide-driven check-in is an
itinerary-driven check-in whose list has a `source_guide_id`, which is how reports can tell them
apart later.

## When a companion is live

All three: the guide is **published**, its author is a **`super_user`**, and it links **at least
one published venue**. Otherwise the list (if any) keeps its rows but loses its share token, so the
public link stops resolving. Republishing mints a new token.

## Decisions worth challenging

- **The companion is private-with-token, not public.** It stays out of the in-app Insider feed.
  Making it `public` would give guides in-app distribution too; that changes what the feed shows
  for every Insider with a guide, so it is left as a deliberate follow-up, not a default.
- **It appears in the author's own lists**, titled after the guide. The sync owns its venue set
  (edits in the app are overwritten on the next guide save); notes on items are left alone.
- **Only linked venues count.** A venue named in prose but not linked is not picked up — name
  matching would guess. The editor now shows "N venues linked" so authors can see it.
- **New installs are aggregate-only**, as everywhere under Option B: a reader without the app who
  taps the card lands on the web itinerary, and the `?ref=` handle credits the author with the
  sign-up if they open the link again after installing.
- **Sync never blocks a guide save**; failures `raise warning`.

## Known gaps

- Guides with no venue links earn nothing until links are added (three published guides today).
- The six hand-built static guide pages under `apps/directory/src/app/guides/<name>/` have no
  author and are untouched.
