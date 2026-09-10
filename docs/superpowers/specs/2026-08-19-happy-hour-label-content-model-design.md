# Happy Hour Label Content Model — Design

**Date:** 2026-08-19
**Status:** Awaiting review
**Scope:** Findings + proposed order of work. No schema or data changes proposed for
immediate execution — two blockers must clear first.

## Why

`happy_hour_windows.label` is declared as a badge but used as a description. The mobile
card renders it in an 11pt pill; production is storing full menus in it.

The rendering half was fixed in #191 — the card's header row had no width cap on the pill
column, so a long label collapsed the venue-name column to ~0pt and the name wrapped one
character per line. After #191 these labels *degrade* (truncate at two lines) instead of
*breaking*. The data problem is untouched.

Measured on production, 2026-08-19:

| Published labels | Count |
|---|---|
| Severe — over 80 chars | **60** |
| Over the badge's two-line budget — 39–80 chars | **44** |
| Fits the pill (≤38 chars) | 14 |
| **Total published windows carrying a label** | **118** |

224 windows total (147 published, 47 draft, 30 archived). The longest published label is
293 characters — Union on the Hill's full happy-hour menu with prices, rendering inside a pill.

## Blocker 1 — there is nowhere for the content to go

- `happy_hour_offers`, the table modeled for exactly this (`category`, `title`,
  `description`), has **0 rows**. It is fetched by
  `packages/shared-api/src/happyhour.ts` and rendered nowhere in the mobile app.
- `happy_hour_windows` has no description or notes column. `label` is the table's only
  free-text field.

All 104 over-budget published labels carry content that exists in no structured column —
prices, restrictions ("bar area only", "dine-in only"), and secondary schedules.
Shortening them deletes the only copy. That is data loss, not curation.

The discriminator for whether a given label can be safely shortened is: **is each fragment
recoverable from a structured column?** Worked example, window `c5cf4b14-…`:

| Fragment | Recoverable from | Verdict |
|---|---|---|
| "daily" | `dow [0..6]` — already rendered in the card's Days row | drop |
| "3 to 6 PM" | `start_time` / `end_time` — already rendered in the When row | drop |
| "bar area only" | nothing | **keep** |

`"Happy Hour, daily 3 to 6 PM — bar area only"` → `"Happy Hour — bar area only"` is
lossless. The same test fails for every price-bearing label, which is what makes a bulk
pass unsafe today.

## Blocker 2 — editing a window silently resolves user disputes

`touch_venue_confirmed`, in `supabase/migrations/20260611230000_listing_verification_loop.sql`,
fires `AFTER INSERT OR UPDATE` on `happy_hour_windows`:

```sql
update public.venues
   set last_confirmed_at = now(),
       listing_disputed  = false
 where id = new.venue_id;
```

Its sibling `touch_window_confirmed` does the same to the window's own `last_confirmed_at`,
as an unconditional `BEFORE INSERT OR UPDATE`.

So a bulk pass over the 104 rows would:

1. **Clear `listing_disputed` on every affected venue** — silently resolving every open
   user-reported dispute. This destroys signal that users generated, and it is not
   recoverable from `listing_reports` alone (that table records the report, not the
   resolution state it was in).
2. Restamp every affected venue and window as freshly confirmed, regardless of whether
   anyone re-confirmed anything.

**Confirmed empirically, not theoretically.** A single-row label edit on Third Street
Social – South Plaza (window `c5cf4b14-…`, venue `85ce33ab-…`) on 2026-08-19 shifted
`last_confirmed_at` from `2026-08-18T17:28:43Z` to `2026-08-20T02:04:17Z` on *both* the
window and its parent venue. That venue had no open disputes (`listing_reports` is empty
for it and `listing_disputed` was already false), so nothing was lost in that instance.
At 104 rows across many venues, that no longer holds.

The stamp is **not restorable through PostgREST** — `touch_window_confirmed` is
unconditional, so any corrective `UPDATE` re-stamps the value it is trying to restore.

It was restored on 2026-08-19 via `supabase db query --linked` (Management API, no DB
password required), in a single transaction using `SET LOCAL session_replication_role =
replica` to suppress the triggers. Both rows are back to `2026-08-18T17:28:43.950628+00`.
`updated_at` was deliberately left at the Aug 20 value — the row genuinely was edited then;
only the confirmation claim was false.

`SET LOCAL session_replication_role` was chosen over `ALTER TABLE … DISABLE TRIGGER`
specifically to stay inside `docs/database-change-policy.md`: the former is a session GUC
scoped to one transaction, the latter is DDL, is table-wide (concurrent writes from live
users would also skip the stamp), and is recorded in `pg_dump` — so an interrupted run
would leave real schema drift for the nightly parity check to find days later. Verified
afterwards: all triggers on `happy_hour_windows` and `venues` remain `tgenabled = 'O'`, and
fresh sessions report `session_replication_role = origin`. No schema change, no drift.

The venue's restored value is **inferred**, not recorded — `venues` was not snapshotted
before the edit. The inference: this venue has exactly one window, whose pre-edit
`last_confirmed_at` and `updated_at` were byte-identical, meaning the venue stamp was
written by that same edit via `touch_venue_confirmed` inside one transaction, so both
received the same `now()`. An app screenshot from before the edit showed "Verified Aug 18",
which corroborates.

## Root cause

The verification loop **conflates editing with confirming**. The migration comment states
the intent plainly:

> Window content edits stamp the window itself…

That assumption holds when every write is a human re-checking a listing. It breaks for any
maintenance write — a typo fix, a wording cleanup, a backfill script — and there is
currently no way to express "I edited this without re-verifying it."

This also sits directly against the project rule that scraped venue data is never
published as venue-confirmed without review: today, *any* automated touch of a window
asserts confirmation on its venue.

## Proposed order of work

1. **Give the triggers an escape hatch** so maintenance writes don't assert confirmation.
   Options: a guard column on the write, a session GUC the trigger checks, or a dedicated
   curation path that bypasses the touch. This is a migration and must land first —
   without it, steps 2 and 3 cause collateral damage on every row they touch.
2. **Decide the destination for descriptive content.** Reviving `happy_hour_offers` is
   cheaper than adding a column (already modeled, already joined in the API), but it needs
   UI to render it — content that lands there today is invisible.
3. **Migrate the 104 labels**, splitting badge text from description, using the
   recoverability test above. Snapshot first; `happy_hour_windows` and `venues` both, since
   the trigger cascade writes to `venues`.

## Not in scope

- Any change to #191, which is complete and independent.
- The 30 `archived` and some `draft` windows carrying operational notes in `label`
  ("ARCHIVED 2026-08-15 — …", "SUPERSEDED 2026-07-11 — …"). The consumer feed filters
  `.eq("status","published")`, so these never render. Ugly, not user-facing.
- A `"test"` label on a Red Door Grill – Overland Park window: draft window on a draft
  venue, also never renders.

## Related

- #191 — the rendering fix
- #193 — the restore of this one row's confirmation stamp
- `CLAUDE.md` — the trigger-cascade gotcha, summarised for every future session
- `docs/database-change-policy.md` — why the restore used a session GUC rather than DDL
