# Contribution Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record when content goes live, and score super-user contributions on a 90-day rolling window so piece 3 has something to rank.

**Architecture:** A `published_at` column on the three content tables, stamped everywhere status becomes `'published'` and cleared everywhere it stops being published, plus a locked-down `contributor_scores` view that weights menus 10, events 3, windows 1. Same shape as piece 1: add a column, stamp it at every write site, guard the invariant.

**Tech Stack:** Supabase Postgres with RLS, Next.js 15 server actions and route handlers, `node --test` with `.mjs` tests that pin TypeScript source by reading it.

**Spec:** `docs/superpowers/specs/2026-08-14-contribution-scoring-design.md`

## Global Constraints

- **Schema changes go through migrations only.** Never edit an applied migration.
- **No destructive SQL.** This plan adds nullable columns, indexes, and a view.
- **No backfill.** Existing published rows keep `published_at = NULL` and score nothing. Decided 2026-08-14.
- **Weights are exactly** menu `10`, event `3`, window `1`.
- **Window is 90 days**, measured on `published_at`, never `created_at`.
- **Only `super_user` and `user` tiers score.** Org staff (`admin`, `owner`) are attributed but never scored — job function is not the game.
- **Copies never score:** `menus.source_menu_id is not null` is excluded.
- **`contributor_scores` is revoked from `anon` and `authenticated`**, mirroring `20260811173852_lockdown_security_definer_views.sql`.
- Tests: `npm test`. Baseline at time of writing: **559 tests, 0 failures, 23 skipped**.
- Typecheck: `npm run typecheck --workspace web`.
- CI must be green. Ask before merging.

## Correction to the spec

The spec lists 8 publish sites. Enumerating them against the source found **13**. The plan uses this list; Task 8 corrects the document.

**Publish — updates (6):**

| # | Site | Table |
|---|---|---|
| 1 | `venue-actions.ts` → `publishMenu` | `menus` |
| 2 | `venue-actions.ts` → `publishMenusByIds` (shared helper) | `menus` |
| 3 | `venue-actions.ts` → `publishHappyHour` | `happy_hour_windows` |
| 4 | `organization-actions.ts` → `publishOrganizationMenu` | `menus` |
| 5 | `event-actions.ts` → `publishEvent` | `venue_events` |
| 6 | `api/intake/claim/route.ts` | `menus` |

`publishMenusByIds` is reached from `publishMenusForWindow` (itself called by `publishHappyHour`) and from `updateHappyHourMenus`. Stamping inside the helper covers all of its callers at once — do not stamp at the call sites.

**Publish — inserts (3):** the intake commit route creates content already published when an owner auto-publishes (`route.ts:291` and `route.ts:322` pick `'published'` unless drafting).

| # | Site | Table |
|---|---|---|
| 7 | `api/intake/commit/route.ts` → menu insert | `menus` |
| 8 | `api/intake/commit/route.ts` → `newWindowRows` | `happy_hour_windows` |
| 9 | `api/intake/commit/route.ts` → `buildEventRows` | `venue_events` |

**Unpublish — must clear (4):**

| # | Site | Table |
|---|---|---|
| 10 | `venue-actions.ts` → `unpublishMenu` | `menus` |
| 11 | `venue-actions.ts` → `unpublishHappyHour` | `happy_hour_windows` |
| 12 | `organization-actions.ts` → `unpublishOrganizationMenu` | `menus` |
| 13 | `event-actions.ts` → `unpublishEvent` | `venue_events` |

---

### Task 1: Migration — the published_at column

**Files:**
- Create: `supabase/migrations/20260814120000_published_at.sql`
- Test: `test/published-at-schema.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `menus.published_at`, `happy_hour_windows.published_at`, `venue_events.published_at`, all `timestamptz` nullable.

- [ ] **Step 1: Write the failing test**

Create `test/published-at-schema.test.mjs`:

```javascript
// test/published-at-schema.test.mjs
//
// Scoring windows on WHEN CONTENT WENT LIVE, not when it was scanned. Without
// this column the only available window is created_at, which silently zeroes
// any contribution published more than 90 days after it was submitted — and a
// super user cannot publish their own work, so that delay is never theirs.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260814120000_published_at.sql"),
  "utf8",
);

test("all three content tables gain published_at", () => {
  for (const table of ["menus", "happy_hour_windows", "venue_events"]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?published_at timestamptz`),
      `${table} needs published_at`,
    );
  }
});

test("the 90-day scan is indexed on non-null values only", () => {
  // Most rows will never be published; indexing them all wastes space on a
  // column the scoring view only ever reads when set.
  const idx = sql.match(/create index[\s\S]*?where published_at is not null/g) ?? [];
  assert.equal(idx.length, 3, "one partial index per table");
});

test("no backfill and nothing destructive", () => {
  assert.doesNotMatch(sql, /\bupdate\s+public\./i, "no backfill — decided 2026-08-14");
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/published-at-schema.test.mjs`
Expected: FAIL — `ENOENT`, the migration does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260814120000_published_at.sql`:

```sql
-- When did this content go live?
--
-- Nothing recorded it. venues has published_at and guides have it; the three
-- content tables did not. The contributor leaderboard scores published content
-- on a 90-day window, and without this the only available clock is created_at
-- — which silently scores zero for anything published more than 90 days after
-- it was scanned. A super user cannot publish their own work, so that delay is
-- never theirs to control.
--
-- No backfill. Existing published rows keep NULL: they are also unattributed,
-- so they could never score anyway, and inventing a publish date would be a
-- guess dressed as data.

alter table public.menus
  add column if not exists published_at timestamptz;
alter table public.happy_hour_windows
  add column if not exists published_at timestamptz;
alter table public.venue_events
  add column if not exists published_at timestamptz;

-- Partial: the scoring view only ever reads rows that have been published.
create index if not exists menus_published_at_idx
  on public.menus (published_at) where published_at is not null;
create index if not exists happy_hour_windows_published_at_idx
  on public.happy_hour_windows (published_at) where published_at is not null;
create index if not exists venue_events_published_at_idx
  on public.venue_events (published_at) where published_at is not null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/published-at-schema.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814120000_published_at.sql test/published-at-schema.test.mjs
git commit -m "feat(scoring): record when content goes live

Scoring windows on publish time, not scan time. Without this the only clock is
created_at, which zeroes any contribution published more than 90 days after it
was scanned — a delay the contributor cannot control. No backfill."
```

---

### Task 2: Stamp and clear in venue-actions

**Files:**
- Modify: `apps/web/src/actions/venue-actions.ts` (`publishMenu`, `publishMenusByIds`, `publishHappyHour`, `unpublishMenu`, `unpublishHappyHour`)
- Test: `test/published-at-sites.test.mjs`

**Interfaces:**
- Consumes: `menus.published_at`, `happy_hour_windows.published_at` from Task 1.
- Produces: nothing new — these are edits in place.

- [ ] **Step 1: Write the failing test**

Create `test/published-at-sites.test.mjs`:

```javascript
// test/published-at-sites.test.mjs
//
// published_at is only trustworthy if every publish stamps it and every
// unpublish clears it. There are 13 such sites across four files, in three
// different shapes (direct update, shared helper, insert), which is exactly
// the situation that left 0 of 136 menus attributed before piece 1.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/** The body of a named exported or private async function. */
function fnBody(src, name) {
  const i = src.indexOf(`async function ${name}(`);
  assert.notEqual(i, -1, `${name} not found`);
  const rest = src.slice(i);
  const end = rest.indexOf("\n}\n");
  return rest.slice(0, end === -1 ? 2000 : end);
}

const venueActions = read("apps/web/src/actions/venue-actions.ts");

test("venue-actions publish sites stamp published_at", () => {
  for (const fn of ["publishMenu", "publishMenusByIds", "publishHappyHour"]) {
    assert.match(fnBody(venueActions, fn), /published_at:/, `${fn} must stamp published_at`);
  }
});

test("venue-actions unpublish sites clear published_at", () => {
  // Otherwise content unpublished and republished later keeps its original
  // date and can skip or re-enter the 90-day window incorrectly.
  for (const fn of ["unpublishMenu", "unpublishHappyHour"]) {
    assert.match(fnBody(venueActions, fn), /published_at:\s*null/, `${fn} must clear published_at`);
  }
});

test("the shared menu helper stamps once, not at its call sites", () => {
  // publishMenusByIds is reached from publishMenusForWindow and
  // updateHappyHourMenus. Stamping in the helper covers both; stamping at the
  // call sites instead would leave the third caller silently unstamped.
  assert.match(fnBody(venueActions, "publishMenusByIds"), /published_at:/);
  assert.doesNotMatch(
    fnBody(venueActions, "publishMenusForWindow"),
    /published_at:/,
    "the caller must not duplicate the stamp",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/published-at-sites.test.mjs`
Expected: FAIL on the first two tests.

- [ ] **Step 3: Stamp the three publish sites**

In `publishMenu`:

```typescript
    .from('menus')
    .update({ status: HH_STATUS_PUBLISHED, published_at: new Date().toISOString() })
```

In `publishMenusByIds`:

```typescript
    .from('menus')
    .update({
      status: HH_STATUS_PUBLISHED,
      is_active: true,
      published_at: new Date().toISOString(),
    })
```

In `publishHappyHour`:

```typescript
    .from('happy_hour_windows')
    .update({ status: HH_STATUS_PUBLISHED, published_at: new Date().toISOString() })
```

- [ ] **Step 4: Clear on the two unpublish sites**

In `unpublishMenu`:

```typescript
    .from('menus')
    .update({ status: HH_STATUS_DRAFT, published_at: null })
```

In `unpublishHappyHour`:

```typescript
    .from('happy_hour_windows')
    .update({ status: HH_STATUS_DRAFT, published_at: null })
```

- [ ] **Step 5: Run test and typecheck**

Run: `node --test test/published-at-sites.test.mjs`
Expected: PASS, 3 tests.

Run: `npm run typecheck --workspace web`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/actions/venue-actions.ts test/published-at-sites.test.mjs
git commit -m "feat(scoring): stamp and clear published_at in venue-actions

publishMenusByIds is a shared helper reached from publishMenusForWindow and
updateHappyHourMenus, so the stamp lives in the helper rather than at its
callers — stamping at call sites would leave one path silently unstamped."
```

---

### Task 3: Stamp and clear in organization-actions and event-actions

**Files:**
- Modify: `apps/web/src/actions/organization-actions.ts` (`publishOrganizationMenu`, `unpublishOrganizationMenu`)
- Modify: `apps/web/src/actions/event-actions.ts` (`publishEvent`, `unpublishEvent`)
- Modify: `test/published-at-sites.test.mjs`

**Interfaces:**
- Consumes: the columns from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `test/published-at-sites.test.mjs`:

```javascript
test("organization menu publish and unpublish maintain published_at", () => {
  const src = read("apps/web/src/actions/organization-actions.ts");
  assert.match(fnBody(src, "publishOrganizationMenu"), /published_at:/);
  assert.match(fnBody(src, "unpublishOrganizationMenu"), /published_at:\s*null/);
});

test("event publish and unpublish maintain published_at", () => {
  const src = read("apps/web/src/actions/event-actions.ts");
  assert.match(fnBody(src, "publishEvent"), /published_at:/);
  assert.match(fnBody(src, "unpublishEvent"), /published_at:\s*null/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/published-at-sites.test.mjs`
Expected: FAIL on the two new tests.

- [ ] **Step 3: Edit organization-actions**

In `publishOrganizationMenu`:

```typescript
    .from('menus')
    .update({ status: HH_STATUS_PUBLISHED, published_at: new Date().toISOString() })
```

In `unpublishOrganizationMenu`:

```typescript
    .from('menus')
    .update({ status: HH_STATUS_DRAFT, published_at: null })
```

- [ ] **Step 4: Edit event-actions**

In `publishEvent`:

```typescript
    .from('venue_events')
    .update({ status: 'published', published_at: new Date().toISOString() })
```

In `unpublishEvent`:

```typescript
    .from('venue_events')
    .update({ status: 'draft', published_at: null })
```

- [ ] **Step 5: Run test and typecheck**

Run: `node --test test/published-at-sites.test.mjs`
Expected: PASS, 5 tests.

Run: `npm run typecheck --workspace web`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/actions/organization-actions.ts apps/web/src/actions/event-actions.ts test/published-at-sites.test.mjs
git commit -m "feat(scoring): stamp and clear published_at for org menus and events"
```

---

### Task 4: Stamp the intake paths

**Files:**
- Modify: `apps/web/src/app/api/intake/claim/route.ts` (menu publish, ~line 40)
- Modify: `apps/web/src/app/api/intake/commit/route.ts` (menu insert, `newWindowRows`)
- Modify: `apps/web/src/utils/intake-content.ts` (`buildEventRows`)
- Modify: `test/published-at-sites.test.mjs`

**Interfaces:**
- Consumes: the columns from Task 1.
- Produces: `buildEventRows` `opts` gains `publishedAt: string | null`.

The commit route inserts content **already published** when an owner auto-publishes: `route.ts:291` sets `targetWindowStatus` and `route.ts:322` sets `menuStatus` to `'published'` unless drafting. The stamp must therefore be conditional on that same expression, not unconditional — a draft must not carry a publish date.

- [ ] **Step 1: Write the failing test**

Append to `test/published-at-sites.test.mjs`:

```javascript
test("the claim route stamps published_at when it publishes", () => {
  const src = read("apps/web/src/app/api/intake/claim/route.ts");
  assert.match(src, /status: 'published'[\s\S]{0,120}?published_at:/);
});

test("intake commit stamps only when it actually publishes", () => {
  // The same expression that chooses 'published' must choose the stamp. An
  // unconditional stamp would date drafts as if they were live, and they would
  // enter the 90-day window without ever being visible to anyone.
  const src = read("apps/web/src/app/api/intake/commit/route.ts");
  assert.match(src, /const publishedAt =/, "one derived value, used by all three inserts");
  assert.match(src, /newWindowRows[\s\S]{0,500}?published_at:/, "window rows need it");
  const menuInsert = src.slice(src.indexOf(".from('menus')"));
  assert.match(menuInsert.slice(0, 700), /published_at:/, "menu insert needs it");
  // Shorthand `publishedAt,` is idiomatic here, so accept either form.
  assert.match(src, /publishedAt,|publishedAt:\s*publishedAt/, "events get it through buildEventRows");
});

test("buildEventRows writes published_at from its options", () => {
  const helper = read("apps/web/src/utils/intake-content.ts");
  assert.match(helper, /publishedAt:\s*string \| null/, "opts must declare it");
  assert.match(helper, /published_at:\s*opts\.publishedAt/, "the row must set it");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/published-at-sites.test.mjs`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Edit the claim route**

```typescript
    .from('menus')
    .update({ status: 'published', is_active: true, published_at: new Date().toISOString() })
```

- [ ] **Step 4: Derive one value in the commit route**

Add this immediately after `menuStatus` is computed (~line 322), so all three inserts share one decision:

```typescript
  // Same condition that picks 'published' above. A draft must not carry a
  // publish date, or it would enter the 90-day scoring window while invisible.
  const publishedAt =
    save_as_draft || send_owner_confirmation ? null : new Date().toISOString();
```

In the `newWindowRows` map, add:

```typescript
      published_at: publishedAt,
```

In the `menus` insert payload, add:

```typescript
        published_at: publishedAt,
```

In the `buildEventRows` call, add:

```typescript
      publishedAt,
```

- [ ] **Step 5: Edit buildEventRows**

In `apps/web/src/utils/intake-content.ts`, add to the `opts` type:

```typescript
    createdByTier: ContributorTier | null;
    /** Set when the commit publishes immediately; null for drafts. */
    publishedAt: string | null;
```

And to the pushed row:

```typescript
      created_by_tier: opts.createdByTier,
      published_at: opts.publishedAt,
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `node --test test/published-at-sites.test.mjs`
Expected: PASS, 8 tests.

Run: `npm test`
Expected: 0 failures. `buildEventRows` gains a required option, so
`test/intake-content-classification.test.mjs` must still pass — it asserts the
row's column set.

Run: `npm run typecheck --workspace web`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/intake/claim/route.ts apps/web/src/app/api/intake/commit/route.ts apps/web/src/utils/intake-content.ts test/published-at-sites.test.mjs
git commit -m "feat(scoring): stamp published_at on the intake paths

The commit route inserts content already published when an owner auto-
publishes, so the stamp is derived from the same expression that picks the
status — an unconditional stamp would date drafts as live and let them enter
the scoring window while invisible."
```

---

### Task 5: The contributor_scores view

**Files:**
- Create: `supabase/migrations/20260814130000_contributor_scores.sql`
- Test: `test/contributor-scores-view.test.mjs`

**Interfaces:**
- Consumes: `published_at` (Task 1), `created_by` / `created_by_tier` (piece 1).
- Produces: view `public.contributor_scores(user_id, tier, city, menus, windows, events, score)`.

- [ ] **Step 1: Write the failing test**

Create `test/contributor-scores-view.test.mjs`:

```javascript
// test/contributor-scores-view.test.mjs
//
// What a contribution is worth. Pinned in SQL because every one of these is a
// product decision someone could plausibly "tidy" into something else:
// the weights, the 90-day window, the copy exclusion, and above all the fact
// that org staff are attributed but never scored.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260814130000_contributor_scores.sql"),
  "utf8",
);

test("weights are menu 10, event 3, window 1", () => {
  assert.match(sql, /\* 10/, "menus weigh 10");
  assert.match(sql, /\* 3/, "events weigh 3");
  assert.match(sql, /as score/, "the weighted total is exposed as score");
});

test("the window is 90 days measured on published_at", () => {
  assert.match(sql, /interval '90 days'/);
  assert.match(sql, /published_at > now\(\) - interval '90 days'/);
  assert.doesNotMatch(sql, /created_at > now\(\)/, "created_at is the wrong clock");
});

test("only published content counts", () => {
  const statusChecks = sql.match(/status = 'published'/g) ?? [];
  assert.equal(statusChecks.length, 3, "one per content table");
});

test("org staff are attributed but never scored", () => {
  // The rule that makes this a game rather than a staff productivity report.
  assert.match(sql, /created_by_tier in \('super_user', 'user'\)/);
  assert.doesNotMatch(sql, /'owner'|'admin'/, "org tiers must not appear in the scoring view");
});

test("copies earn nothing", () => {
  // A copied menu carries source_menu_id. Crediting copies would let one menu
  // be farmed across every venue in an org.
  assert.match(sql, /source_menu_id is null/);
});

test("the view is locked down like toastmaker_scores", () => {
  assert.match(sql, /security_invoker = on/);
  assert.match(sql, /revoke all on public\.contributor_scores from anon, authenticated/);
  assert.doesNotMatch(sql, /grant select on public\.contributor_scores to (anon|authenticated)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contributor-scores-view.test.mjs`
Expected: FAIL — `ENOENT`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260814130000_contributor_scores.sql`:

```sql
-- What a contribution is worth.
--
-- Weights: a menu is 10, an event 3, a window 1. Menus dominate because
-- adding Happy Hour menus is the behaviour this rewards, and a menu is also
-- the most work — sections, items, prices.
--
-- Only super users and regular users score. Owners, managers and hosts are
-- attributed on the rows for audit, but scanning your own venue is job
-- function, not the game, and an owner signs off on every intake entry anyway.
--
-- Window is 90 days on published_at, matching toastmaker_scores' cadence.
-- Copies (source_menu_id is not null) are excluded: crediting them would let
-- one menu be farmed across every venue in an org.

create or replace view public.contributor_scores as
with contributions as (
  select m.created_by as user_id, m.created_by_tier as tier, v.city,
         1 as menus, 0 as windows, 0 as events
    from public.menus m
    join public.venues v on v.id = m.venue_id
   where m.created_by is not null
     and m.created_by_tier in ('super_user', 'user')
     and m.status = 'published'
     and m.source_menu_id is null
     and m.published_at > now() - interval '90 days'

  union all

  select w.created_by, w.created_by_tier, v.city, 0, 1, 0
    from public.happy_hour_windows w
    join public.venues v on v.id = w.venue_id
   where w.created_by is not null
     and w.created_by_tier in ('super_user', 'user')
     and w.status = 'published'
     and w.published_at > now() - interval '90 days'

  union all

  select e.created_by, e.created_by_tier, v.city, 0, 0, 1
    from public.venue_events e
    join public.venues v on v.id = e.venue_id
   where e.created_by is not null
     and e.created_by_tier in ('super_user', 'user')
     and e.status = 'published'
     and e.published_at > now() - interval '90 days'
)
select user_id,
       tier,
       city,
       sum(menus)   as menus,
       sum(windows) as windows,
       sum(events)  as events,
       sum(menus) * 10 + sum(events) * 3 + sum(windows) * 1 as score
  from contributions
 group by user_id, tier, city;

-- Same treatment as toastmaker_scores in 20260811173852: this is an internal
-- scoring surface exposing per-user activity across venues. Piece 3's
-- SECURITY DEFINER function will be its only reader, returning nothing but
-- rank, handle and score.
alter view public.contributor_scores set (security_invoker = on);
revoke all on public.contributor_scores from anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/contributor-scores-view.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814130000_contributor_scores.sql test/contributor-scores-view.test.mjs
git commit -m "feat(scoring): contributor_scores view

Menu 10, event 3, window 1 over a 90-day published_at window. Only super_user
and user tiers score — org staff are attributed but scanning your own venue is
job function, not the game. Copies excluded via source_menu_id. Revoked from
anon and authenticated, mirroring toastmaker_scores."
```

---

### Task 6: Guard every publish site

**Files:**
- Modify: `test/published-at-sites.test.mjs`

**Interfaces:** none.

The per-site tests prove today's 13 sites are right. They cannot catch a fourteenth.

- [ ] **Step 1: Write the failing test**

Append to `test/published-at-sites.test.mjs`:

```javascript
import { readdirSync, statSync } from "node:fs";

function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

test("EVERY status change to published also sets published_at", () => {
  // The invariant the per-site tests cannot hold: it fails for a site nobody
  // has written yet.
  //
  // LIMIT, stated so nobody over-trusts this: it can only see a LITERAL
  // status. The intake inserts use computed values (`status: menuStatus`,
  // `status: opts.status`), which this will never match — those are covered by
  // the explicit assertions in the intake test above. This guard is for the
  // common shape: someone adding another `status: 'published'` update.
  const offenders = [];
  for (const file of sourceFiles(join(repoRoot, "apps/web/src"))) {
    const src = readFileSync(file, "utf8");
    const rel = file.replace(repoRoot + "/", "");
    // Only the three content tables matter; venues already had published_at.
    if (!/(menus|happy_hour_windows|venue_events)/.test(src)) continue;

    for (const m of src.matchAll(/status:\s*(HH_STATUS_PUBLISHED|'published')/g)) {
      const around = src.slice(Math.max(0, m.index - 400), m.index + 400);
      if (!/(menus|happy_hour_windows|venue_events)/.test(around)) continue;
      if (!/published_at/.test(around)) {
        offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these publish sites do not set published_at:\n  ${offenders.join("\n  ")}`,
  );
});
```

- [ ] **Step 2: Run the test**

Run: `node --test test/published-at-sites.test.mjs`
Expected: PASS — Tasks 2–4 fixed every site.

If it fails, the reported path is a site those tasks missed. Stamp it the same way and re-run.

- [ ] **Step 3: Prove the guard has teeth**

Temporarily delete `published_at: new Date().toISOString(),` from `publishMenu` in `apps/web/src/actions/venue-actions.ts`, then run:

Run: `node --test test/published-at-sites.test.mjs`
Expected: FAIL, naming `apps/web/src/actions/venue-actions.ts` and a line number.

Restore with `git checkout apps/web/src/actions/venue-actions.ts` and re-run to confirm PASS. A guard that cannot fail is not a guard.

- [ ] **Step 4: Commit**

```bash
git add test/published-at-sites.test.mjs
git commit -m "test(scoring): fail when a publish site forgets published_at

Publishing happens in three shapes across 13 sites. The per-site tests prove
today's are right; this walks apps/web/src and fails for the fourteenth.
Mutation-checked."
```

---

### Task 7: Surface the approved-but-unpublished backlog

**Files:**
- Modify: `apps/web/src/app/orgs/[orgId]/intake-review/page.tsx`
- Test: `test/intake-review-backlog.test.mjs`

**Interfaces:**
- Consumes: `intake_submissions.status`, `menus.status`.
- Produces: nothing new.

Every scored contribution now reaches the board only after an owner approves **and then** publishes. Without a visible backlog the whole scoreboard can stall on a queue nobody is watching, and contributors see only that their work earned nothing.

- [ ] **Step 1: Write the failing test**

Create `test/intake-review-backlog.test.mjs`:

```javascript
// test/intake-review-backlog.test.mjs
//
// Since #178, approving does not publish. Since the scoring model counts
// published content only, an approved submission whose menu is never
// published is worth zero to its contributor — permanently and silently.
//
// The review queue therefore has to show what is waiting on a publish.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  join(__dirname, "..", "apps/web/src/app/orgs/[orgId]/intake-review/page.tsx"),
  "utf8",
);

test("the review queue counts approved submissions still unpublished", () => {
  assert.match(page, /awaitingPublish/, "the backlog must be computed");
  assert.match(page, /'approved'/, "it counts approved submissions");
});

test("the backlog is shown, not just computed", () => {
  const idx = page.indexOf("awaitingPublish");
  assert.notEqual(idx, -1);
  // It has to appear in rendered output, or it is a variable nobody reads.
  assert.match(page.slice(idx), /\{awaitingPublish/, "must be rendered");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/intake-review-backlog.test.mjs`
Expected: FAIL — `awaitingPublish` does not exist.

- [ ] **Step 3: Compute the backlog**

In the page's data loading, alongside the existing pending-submission query, add:

```typescript
  // Approved but not yet live. Approving stopped publishing in #178, and the
  // leaderboard counts published content only — so anything sitting here is a
  // contributor earning nothing while they wait on us.
  const { data: awaitingRows } = await db
    .from('intake_submissions')
    .select('id, menu_id, menus!inner(status)')
    .eq('review_org_id', orgId)
    .eq('status', 'approved')
    .neq('menus.status', 'published');
  const awaitingPublish = (awaitingRows ?? []).length;
```

- [ ] **Step 4: Render it**

Above the pending queue list, add:

```tsx
      {awaitingPublish > 0 ? (
        <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-5">
          <p className="text-body-sm font-medium text-foreground">
            {awaitingPublish} approved {awaitingPublish === 1 ? 'submission is' : 'submissions are'} still unpublished
          </p>
          <p className="text-body-sm text-muted mt-0.5">
            Approving saves a draft. Publish from the venue page to make it live — until then it is not visible to guests.
          </p>
        </div>
      ) : null}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `node --test test/intake-review-backlog.test.mjs`
Expected: PASS, 2 tests.

Run: `npm run typecheck --workspace web`
Expected: clean. If the Supabase types reject the `menus!inner(status)` embed, cast the result: `as unknown as Array<{ id: string }>`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/orgs/[orgId]/intake-review/page.tsx" test/intake-review-backlog.test.mjs
git commit -m "feat(scoring): show the approved-but-unpublished backlog

Approving stopped publishing in #178 and scoring counts published content
only, so an approved submission that is never published is worth zero to its
contributor — silently. The queue now says how many are waiting."
```

---

### Task 8: Correct the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-contribution-scoring-design.md`

**Interfaces:** none.

- [ ] **Step 1: Replace the site tables**

The spec's §2 lists 8 sites. Replace both tables with the 13 enumerated at the top of this plan, and add beneath them:

```markdown
`publishMenusByIds` is a shared helper reached from `publishMenusForWindow`
(itself called by `publishHappyHour`) and from `updateHappyHourMenus`. The
stamp belongs in the helper, not at its call sites — stamping at call sites
would leave the third path silently unstamped.
```

- [ ] **Step 2: Record the count correction**

Under the site tables, add:

```markdown
> Corrected 2026-08-14 during planning: the first draft listed 8 sites. The
> source has 13 — six publish updates, three publish inserts, and four
> unpublish clears. The miss was `publishMenusByIds` and the four unpublish
> paths.
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-14-contribution-scoring-design.md
git commit -m "docs(spec): correct the publish-site inventory from 8 to 13

Planning against the source found a shared menu-publish helper and four
unpublish paths the first draft missed."
```

---

## Done when

- `npm test` passes. Baseline 559; this plan adds 20 tests (3 schema + 9 site/guard + 6 view + 2 backlog), so expect **579**.
- `npm run typecheck --workspace web` is clean.
- Both migrations apply on a fresh `npx supabase db reset`.
- The guard fails when any publish site drops the stamp, verified by mutation.
- `select * from public.contributor_scores` returns zero rows immediately after deploy — nothing is published-and-attributed yet — and rises only as super users contribute and owners publish.

## Explicitly not in this plan

- **The public leaderboard page, city rollups, the `LEADERBOARD_ENABLED` toggle, and the `SECURITY DEFINER` read** — piece 3.
- **Backfilling `published_at`** for existing content.
- **Opening contribution to regular users.** The `'user'` tier is already in the view's tier list, so it starts scoring the day such contributions exist.
- **Restructuring `apps/android` onto the iOS pattern** — its own design round.
- **Recording org role separately from intake tier** — Open question 1 in the spec.
