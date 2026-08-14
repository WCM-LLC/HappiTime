# Contribution Scoring — Design

**Date:** 2026-08-14
**Status:** Awaiting review
**Scope:** Piece 2 of 3. Scoring only — no public page, no UI ranking.
**Predecessor:** `2026-08-13-contribution-attribution-design.md` (piece 1, shipped in #176)

## Why

Piece 1 records who contributed. This decides what a contribution is worth, so
piece 3 has something to rank.

State on production at time of writing, hours after piece 1 merged:

| Table | Attributed | Total |
|---|---|---|
| `menus` | 0 | 135 |
| `happy_hour_windows` | 0 | 219 |
| `venue_events` | 7 (pre-existing) | 157 |

Nothing is attributed yet. That is expected and was chosen: no backfill, count
from launch. The board starts empty and fills as contributions arrive.

## Decisions

Made with Juan on 2026-08-14.

| Decision | Choice | Rationale |
|---|---|---|
| What counts | **Published content only** | Strictest reading. See the tradeoff below — this was chosen over the recommended alternative, deliberately. |
| Window | **Rolling 90 days** | Matches `toastmaker_scores`, so the two leaderboards behave alike and the board stays winnable. |
| Window basis | **`published_at`**, a new column | See "The clock problem". |
| Weights | **menu 10, event 3, window 1** | Menus dominate, matching "prioritizes adding Happy Hour menus". A menu is also the most work: sections, items, prices. |
| Menu items | Not counted | Decided in piece 1 — counting them rewards splitting one item into ten. |
| Copies | Excluded from scoring | `menus.source_menu_id is not null` marks a copy. Crediting copies would let one menu be farmed across venues. |
| Who earns points | **Super users and (later) regular users only** | The game population. See "Job function earns nothing". |
| Org staff | **Attributed, never scored** | Owners, managers and hosts scanning their own venues are doing their job, and an owner approves every intake entry anyway. Recording who did it still has audit value; awarding points for it does not. |

### The published-only tradeoff, recorded honestly

The recommendation was to score on **approval**, not publication. It was not taken.

Under published-only, a super user's score depends on two owner actions: approve,
then publish. Super users can never publish (`canPublishIntakeForVenue` returns
false for them unconditionally), and since #178 approval no longer publishes
either. An owner who approves but does not publish leaves the contribution
worth zero, indefinitely, with nothing on screen explaining why.

This is the accepted behaviour. The mitigation below exists because of it.

### Job function earns nothing

Owners, managers and hosts scan as part of running their venue. That work is
already its own reward and an owner signs off on every intake entry, so points
would be meaningless — and a scoreboard topped by the staff who run the
listings would defeat the point of the game.

The rule is airtight without a special case, because `canUseIntakeForVenue`
restricts the `owner` tier to venues in the caller's **own** org: an org member
cannot scan anyone else's venue. So "org staff scanning for their own
organization" is the only thing org staff can do, and excluding the tier
wholesale is exactly equivalent. `admin` (HappiTime staff) is excluded on the
same reasoning.

Scoring therefore covers `super_user` today and `user` when regular users gain
a contribution path. Both are listed as data, so opening it up stays a one-line
change rather than a rewrite.

**A consequence worth stating.** Super users can never publish, and since #178
approval does not publish either. Now that org staff are excluded, *every*
scored contribution — 100% of the board, not a subset — reaches the scoreboard
only after two owner actions. That is what makes §5 load-bearing rather than
optional.

### The clock problem

There is no record of when content was published. `venues` has `published_at`
and guides have it; `menus`, `happy_hour_windows` and `venue_events` do not.

Without it, the only available window is "created in the last 90 days AND
currently published", which combines badly with published-only:

> A super user scans on day 1. The owner approves on day 20 and publishes on
> day 100. The menu is live, but it was created 100 days ago, so it falls
> outside the window and scores nothing — permanently. The contributor is
> penalised for the owner's delay, invisibly.

So piece 2 adds `published_at` and windows on it. The 90 days then measures
when content went live, and publish delay can no longer silently erase a
contribution.

## Design

### 1. Migration

`published_at timestamptz` (nullable) on `menus`, `happy_hour_windows` and
`venue_events`, with a partial index on non-NULL values for the 90-day scan.

**No backfill.** Existing published rows keep `published_at = NULL` and score
nothing. They are also unattributed, so they could never have scored anyway;
inventing a publish date would be a guess dressed as data.

### 2. Stamp it at every publish site

Two shapes. Missing the second is the easy mistake, because "publish" reads
like an update.

**Updates** — content that already exists and is being flipped live:

| Site | Table |
|---|---|
| `actions/venue-actions.ts` → `publishMenu` | `menus` |
| `actions/venue-actions.ts` → `publishHappyHour` | `happy_hour_windows` |
| `actions/organization-actions.ts` → `publishOrganizationMenu` | `menus` |
| `actions/event-actions.ts` → `publishEvent` | `venue_events` |
| `app/api/intake/claim/route.ts` | `menus` |

**Inserts** — the intake commit route creates content **already published**
when an owner auto-publishes (`route.ts:291` and `route.ts:322` choose
`'published'` unless drafting), so `published_at` must be set at insert time:

| Site | Table |
|---|---|
| `app/api/intake/commit/route.ts` → `newWindowRows` | `happy_hour_windows` |
| `app/api/intake/commit/route.ts` → menu insert | `menus` |
| `app/api/intake/commit/route.ts` → `buildEventRows` | `venue_events` |

`actions/guide-review-actions.ts` already does exactly this for guides
(`status: 'published', published_at: now`). That is the pattern to copy, not a
new invention.

**Unpublishing** clears `published_at` back to NULL. Otherwise content
unpublished and republished later keeps its original date and can re-enter or
skip the window incorrectly.

### 3. The scoring view

`contributor_scores`, one row per `(user_id, created_by_tier, city)`:

- counts of published menus, windows and events attributed to that user, whose
  `published_at` falls in the trailing 90 days
- `score` = `menus × 10 + events × 3 + windows × 1`
- menus with a non-NULL `source_menu_id` are excluded — copies are attributed
  for audit but earn nothing
- `city` comes from `venues.city`, so piece 3 can rank per city without
  re-deriving it

The view covers only the scoring tiers (`super_user`, and `user` once regular
users can contribute). Org-staff contributions are attributed on the rows but
never appear here — points are a game mechanic, and job function is not the
game. The tier list is data in one place, so admitting `user` later is a
one-line change.

`created_by_tier` is still carried on each row so piece 3 can label or split by
tier without re-deriving it.

**Locked down like its neighbour.** `security_invoker = on`, and `revoke all
from anon, authenticated`, mirroring `20260811173852_lockdown_security_definer_views.sql`'s
treatment of `toastmaker_scores`. That migration exists because the scoring
surface let any authenticated or anonymous client read per-user check-in counts
and referral attribution across all venues. This view has the same shape — per
user, per venue, activity counts — and gets the same handling. Piece 3's
`SECURITY DEFINER` function will be its only reader.

### 4. The guard

A test asserting that every site setting a status to `'published'` on these
three tables also sets `published_at`, and that every unpublish clears it.

This is a five-plus-site invariant with two different shapes and nothing else
enforcing it — the same situation that left 0 of 136 menus attributed before
piece 1. The guard is the durable part of this work.

### 5. Mitigation for published-only

An owner-facing count of approved-but-unpublished submissions, so the backlog
that contributors' scores now depend on is visible rather than silent.

**In scope for piece 2**, confirmed 2026-08-14. It is not decoration: with org
staff excluded, every single scored contribution now depends on an owner
approving and then publishing. Without a visible backlog, the whole scoreboard
can stall on a queue nobody is looking at, and contributors would see only that
their work earned nothing.

## Non-goals

- **The public page, city rollups, the toggle** — piece 3.
- **Backfilling `published_at`** for existing content. Deliberately declined.
- **Changing who may publish.** #178 settled that: owners publish, managers and
  hosts queue.
- **Toastmaker integration.** Toastmaker status is a badge on the eventual
  page, never a ranking input. `toastmaker_scores` is not read by this work.
- **Recording org role separately from intake tier.** `created_by_tier` stores
  the intake tier, so a manager and a host both record as `'owner'`. Harmless
  here (both are excluded from the board) but noted in Open questions.

## Testing

- Migration applies cleanly; existing rows unaffected (`published_at` NULL).
- Publishing through each of the five update sites stamps `published_at`.
- An owner's auto-publishing intake commit stamps it at insert.
- Unpublishing clears it.
- The guard fails when a publish site omits the stamp — mutation-checked.
- The view: weights arithmetic, the 90-day boundary, copies excluded, and that
  `anon` and `authenticated` cannot select from it.
- Full suite stays green. Baseline at time of writing: 559 tests, 0 failures.

## Open questions

1. **`created_by_tier` cannot distinguish owner from manager from host** —
   `getIntakeTier` returns `'owner'` for any org member with a scan role. The
   leaderboard excludes all three, so this costs nothing today. It would matter
   if per-role contribution reporting is ever wanted, and the fix then is to
   record the org role alongside the tier.
2. ~~Whether the mitigation in §5 belongs in this piece~~ — resolved
   2026-08-14: it belongs here.

## Related work, not in this piece

**Restructure `apps/android` to follow the iOS pattern.** Requested 2026-08-14.
`apps/ios` owns no dependencies and no App.tsx — it is documentation and run
commands pointing at `apps/mobile`, which is the canonical app. `apps/android`
instead duplicates a real wrapper with its own dependency list, which is
exactly what drifted and left the Happy Hour scan unlinked on Android for
months (#177). Adopting the iOS shape removes that entire class of failure
rather than guarding against it. Sizeable: it touches EAS build config and the
Android native project layout, so it needs its own design round.
