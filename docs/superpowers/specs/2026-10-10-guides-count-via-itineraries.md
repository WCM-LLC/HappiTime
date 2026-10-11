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

## Post-merge findings (review of #250)

- **Fixed in the follow-up PR — the guide card did not open the app on iOS.** Universal Links do
  not fire when the tap starts on `happitime.biz` itself; iOS keeps same-domain navigation in
  Safari. The card links to `/i/{token}` on the same domain, so Safari readers landed on the web
  copy and were never attributed. `/i/[token]` now carries an explicit "Open in the HappiTime app"
  button (`happitime://itinerary?token=…&ref=…`), which also covers in-app browsers.
- **Fixed in the follow-up PR — an itinerary link tapped while the app sat on the sign-in /
  onboarding gate was lost.** The root capture hook kept only the `ref`. It now stashes the URL
  (`pendingItineraryLink`), and `useItineraryDeepLink` opens it once the navigator mounts. Needs
  an app release.
- **Fixed in `20261011050000_guide_itinerary_guards.sql` — eligibility was only re-checked when
  the guide was written.** A venue's status or slug changing, or the author being promoted or
  demoted, now re-syncs the affected guides immediately.
- **Fixed, same migration — the author could break the companion from the app.** Direct client
  writes can no longer delete a companion, change its sharing (visibility, token, owner) or its
  venue set. Renaming and item notes are still allowed. The guards apply only when
  `current_user` is `authenticated` / `anon`, so the sync, FK cascades, account deletion and the
  service role are unaffected. The app shows the refusal as an error; it has no special UI for
  companion lists yet.
  A companion retired with its guide can only be given a link again by the sync, not by the app's
  share button. Deleting a linked venue re-syncs too, and the sync resets a companion to private.
- **Fixed, same migration — retiring on guide delete failed open.** It now fails closed: if the
  link cannot be retired the delete aborts.

## Follow-ups from the review of #254

All three fixed in `20261011060000_guide_itinerary_followups.sql`:

- **A venue born published.** A venue inserted already-published under a slug a guide links now
  re-syncs that guide. (Delete-and-recreate is this project's normal way to replace a venue.)
- **Friend shares of a retired companion.** A friend the companion was shared with in the app
  keeps their `itinerary_share` grant and can still open it, but `record_itinerary_touch` no
  longer credits a companion whose link has been retired.
- **Racing re-syncs.** `sync_guide_itinerary` takes a per-guide advisory lock before reading
  anything, so a sync that waited cannot act on eligibility that was lost while it waited.
  Multi-guide re-syncs take those locks in id order.
  Deleting a guide retires its link under the same lock.

Two points from the review of that migration are deliberately left:

- **After a guide is deleted, its list is an ordinary list.** `source_guide_id` is cleared, so a
  friend it was shared with can credit the author again — the same as any private list an Insider
  shares with a friend. That is existing itinerary behaviour, not guide credit.
- **Bulk venue writes in two transactions can deadlock on the per-guide locks**, because the
  triggers are row-level and the locks are held to commit. Postgres aborts one sync, the venue
  write still commits (the trigger swallows it with a warning), and that guide's companion is
  stale until its next re-sync.
