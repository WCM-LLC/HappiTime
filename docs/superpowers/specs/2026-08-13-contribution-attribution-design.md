# Contribution Attribution — Design

**Date:** 2026-08-13
**Status:** Awaiting review
**Scope:** Piece 1 of 3. Attribution only — no scoring, no public page.

## Why

A contributor leaderboard ranks people by the Happy Hour content they add. HappiTime
cannot currently produce that ranking, because it does not record who added anything.

Measured on production, 2026-08-13:

| Table | Rows | Attributed | Notes |
|---|---|---|---|
| `menus` | 136 (117 published) | **0** | no `created_by` column exists |
| `happy_hour_windows` | 219 | **0** | has `verified_by`, no `created_by` |
| `venue_events` | 152 | **7** | column exists and is written, rarely exercised |
| `intake_submissions` | **0** | — | table exists; the write path has never fired |
| `menu_items` | 1,048 | n/a | deliberately out of scope |

`intake_submissions.submitted_by` is the only contributor record in the schema, and
`api/intake/commit/route.ts:482` writes it only when `save_as_draft && !canPublish`.
Everyone contributing to date could publish, so the branch never ran. The pattern
across the schema is that the intake flow attributes and nothing else does.

This is the foundation for pieces 2 (scoring) and 3 (the public page). Neither can
begin until contributions carry an author.

## Decisions

Made with Juan on 2026-08-13.

| Decision | Choice | Rationale |
|---|---|---|
| What counts | Menus, happy-hour windows, events / event series | Menus are the priority unit. Menu **items** excluded — counting them rewards splitting one item into ten. |
| Backfill | None. Existing rows stay `NULL` | Nobody gets credit for work we cannot prove they did. The board starts empty and fills legitimately. |
| Business contributors | Org owners / managers / editors excluded from the board | Juan's call: the leaderboard is a community program, not a vendor scoreboard. |
| Who competes | Super users now; regular users later | Regular users have no contribution path today (`getIntakeTier` returns `null`). Filter by tier as **data**, not a hardcoded `super_user`, so opening it later is config, not a rewrite. |
| Scraped content | Never attributed | Consistent with HT-SOP-003: scraped data is not presented as human-confirmed. |

### Correcting two premises

Both surfaced during design and changed the shape of this work:

1. **The console is not owners-only.** `/intake/capture` lives in `apps/web`, but
   `getIntakeTier` admits `admin`, `owner` (including org *editors*), and
   `super_user`; the mobile app calls the same API. Filtering contributions by
   *surface* would exclude the wrong people in both directions. **Tier is the axis.**
2. **Regular users cannot contribute at all.** `getIntakeTier` returns `null` for
   anyone who is not an admin, an org member in an intake role, or a super user.
   Population today: 69 regular users (44 with handles, no contribution path),
   4 super users (4 with handles), 5 org members.

## Design

### Schema

One migration. Two new columns on each of three tables, all nullable, no backfill:

```sql
alter table public.menus
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by_tier text
    check (created_by_tier in ('admin','owner','super_user','user'));
```

Same for `public.happy_hour_windows`. `venue_events` already has `created_by`, so it
gains only `created_by_tier`.

`created_by_tier` snapshots the contributor's tier **at the moment of contribution**.
Roles change: a super user who later joins an org as an owner must not retroactively
vanish from past standings or silently re-weight history. Deriving tier at query time
would rewrite the past every time someone's role changed. `'user'` is permitted now so
opening contribution later needs no migration.

`on delete set null` keeps a contribution row alive when an account is deleted; the
credit simply becomes unattributed. That is the correct behaviour for a deletion
request — the menu is HappiTime's, the attribution is the person's.

Index for the piece-2 aggregation:

```sql
create index if not exists menus_created_by_idx
  on public.menus (created_by) where created_by is not null;
```

### Write paths

The column is worthless unless every path fills it. Paths to cover:

- `api/intake/commit/route.ts` — the `menus` insert (line ~329) and the
  `happy_hour_windows` insert (line ~305). Both currently unattributed. `venue_events`
  already passes `createdBy` and needs only the tier added.
- Console manual entry — the menu / window / event actions in `apps/web/src/actions/`.
  These must be enumerated during implementation; the count is not yet known and is the
  main sizing risk in this piece.
- `scripts/intake-venue.mjs` and any service-role writer — deliberately leave **NULL**.
  Scraped rows must never earn leaderboard credit.

The tier is already computed in the intake flow (`getIntakeTier`) and is passed to the
commit route today, so the intake paths need plumbing, not new logic. Console actions
will need a tier resolution at write time.

### Considered and rejected: a `contributions` ledger table

A single append-only table `(user_id, tier, kind, target_id, venue_id, created_at)`
would make piece 2 a one-table aggregation instead of a three-table union. Rejected: it
is a second source of truth that drifts the moment a menu is deleted, unpublished, or
merged, and it would need its own reconciliation. Attribution belongs on the row it
describes. Piece 2 absorbs the union cost once, in one view.

### Regression guard

The reason this design is needed at all is that write paths were added without
attribution — producing 0 rows in `intake_submissions` and 7/152 on `venue_events`.
Nothing prevented that, and nothing currently prevents the next one.

A test enumerates insert sites against `menus`, `happy_hour_windows`, and
`venue_events` across `apps/web/src` and asserts each supplies `created_by`, with an
explicit allowlist for the service-role writers that must stay NULL. This follows the
source-pinning style already used in `test/intake-content-classification.test.mjs` and
`test/intake-extract-error-contract.test.mjs`.

## Non-goals

- **Scoring and weights** — piece 2. This design records contributions; it assigns no
  points and takes no position on their relative worth.
- **The public page, city rollups, the toggle** — piece 3.
- **Opening contribution to regular users** — a product change to `getIntakeTier` with
  real moderation load (69 users into a review queue). The tier column makes it
  possible later without touching this schema.
- **Backfilling the 136 menus** — explicitly declined.
- **Toastmaker integration** — Toastmaker status is a badge on the eventual page, never
  a ranking input. `toastmaker_scores` is not read by this work and stays revoked per
  migration `20260811173852`.

## Testing

- Migration applies cleanly and is reversible; existing rows unaffected (all NULL).
- An intake commit as each tier writes `created_by` **and** the correct
  `created_by_tier` on menu, window, and event rows.
- A service-role script write leaves both columns NULL.
- The regression guard fails when an insert site omits `created_by`.
- The full suite continues to pass; the baseline at time of writing is 529 tests,
  0 failures, 23 skipped.

## Open questions

1. **How many console action write paths are there?** Not yet enumerated. This is the
   main unknown for sizing; implementation starts by listing them.
2. **Should an *approved* submission credit the submitter, the approver, or both?** A
   super user's scan is drafted and an owner approves it. The contribution is the super
   user's; the approval is the owner's. This design attributes to the submitter, which
   is right for a contributor board, but piece 2 should confirm before scoring.
3. **`menus.created_by` is exposed to anon** for published rows via existing read
   policies. A bare UUID is not identifying and the eventual board publishes handles
   deliberately, but if this is unwanted, a column-level revoke is the fix.
