# Contribution Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record who contributed each Happy Hour menu, window, and event, so a contributor leaderboard has something to rank.

**Architecture:** Two nullable columns (`created_by`, `created_by_tier`) on `menus`, `happy_hour_windows`, and `venue_events`, filled at all eight insert sites. Attribution lives on the row it describes — no separate ledger table, no second source of truth. Existing rows stay NULL; nothing is backfilled. A source-pinning test enumerates the insert sites so the next one cannot silently skip attribution.

**Tech Stack:** Next.js 15 App Router (server actions + route handlers), Supabase Postgres with RLS, `node --test` with `.mjs` test files that pin TypeScript source by reading it.

**Spec:** `docs/superpowers/specs/2026-08-13-contribution-attribution-design.md`

## Global Constraints

- **Schema changes go through migrations only.** Never edit an applied migration; add a new one.
- **No destructive SQL.** This plan adds nullable columns and indexes only. Nothing is dropped, renamed, or backfilled.
- **No backfill.** The 136 existing menus, 219 windows, and 145 unattributed events stay NULL. Decided 2026-08-13.
- **Scraped and machine-generated rows are never attributed.** `created_by` stays NULL for them (HT-SOP-003).
- **Credit the submitter, not the approver.** A super user scans and an owner approves; the contribution belongs to the super user.
- **Tier values** are exactly `'admin' | 'owner' | 'super_user' | 'user'`. `'user'` is permitted by the constraint now so opening contribution to regular users later needs no migration.
- **Tier is snapshotted at write time**, never derived at query time. Roles change; history must not.
- Tests run with `npm test` (`node --test test/*.test.mjs`). Baseline at time of writing: 529 tests, 0 failures, 23 skipped.
- Typecheck with `npm run typecheck --workspace web`.
- CI must be green before the work counts as done. Ask before merging.

## Corrections to the spec

Two claims in the merged spec are wrong; Task 8 fixes the document.

1. The spec's write-path table marks `actions/event-actions.ts:138` as unattributed. It already sets `created_by: userId`. Only `created_by_tier` is missing there.
2. The spec does not mention that `actions/menu-tree.ts:175` is the shared insert behind `cloneOrganizationMenuToVenue`, `cloneVenueMenuToVenue`, `replaceMenuTreeFromSource`, `syncVenueMenuFromOrganizationMenu`, and `syncOrganizationMenuCopies` — menu **copies**, not original authorship. Attributing them is right for audit, but crediting them would let someone farm points by cloning one menu across many venues. `menus.source_menu_id` is non-NULL on every copy, so piece 2 excludes them at scoring time. This plan attributes; it does not score.

---

### Task 1: Migration — add the attribution columns

**Files:**
- Create: `supabase/migrations/20260813180000_contribution_attribution.sql`
- Test: `test/contribution-attribution-schema.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: columns `menus.created_by`, `menus.created_by_tier`, `happy_hour_windows.created_by`, `happy_hour_windows.created_by_tier`, `venue_events.created_by_tier`. (`venue_events.created_by` already exists.)

- [ ] **Step 1: Write the failing test**

Create `test/contribution-attribution-schema.test.mjs`:

```javascript
// test/contribution-attribution-schema.test.mjs
//
// A contributor leaderboard cannot rank what nobody recorded. Before this
// migration: 0 of 136 menus and 0 of 219 windows carried an author, because
// no column existed to hold one.
//
// These tests pin the migration's shape. They read SQL rather than a live
// database, matching how the other schema tests in this suite work.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260813180000_contribution_attribution.sql"),
  "utf8",
);

test("menus and happy_hour_windows gain both attribution columns", () => {
  for (const table of ["menus", "happy_hour_windows"]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?created_by uuid`),
      `${table} needs created_by`,
    );
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?created_by_tier text`),
      `${table} needs created_by_tier`,
    );
  }
});

test("venue_events gains only the tier column", () => {
  // created_by already exists there and is already written. Re-adding it would
  // be harmless with IF NOT EXISTS, but claiming to add it hides that the
  // column predates this work.
  const eventsBlock = sql.slice(sql.indexOf("alter table public.venue_events"));
  assert.match(eventsBlock, /created_by_tier text/);
});

test("every tier column allows exactly the four tiers", () => {
  // 'user' is permitted now so opening contribution to regular users later
  // needs no migration.
  const checks = sql.match(/created_by_tier in \([^)]*\)/g) ?? [];
  assert.equal(checks.length, 3, "one check constraint per table");
  for (const c of checks) {
    for (const tier of ["admin", "owner", "super_user", "user"]) {
      assert.ok(c.includes(`'${tier}'`), `${tier} must be allowed: ${c}`);
    }
  }
});

test("attribution survives account deletion as NULL, never cascading", () => {
  // Deleting an account must not delete the venue's menu. The credit
  // disappears; the content stays.
  const refs = sql.match(/references auth\.users\(id\)[^,\n]*/g) ?? [];
  assert.ok(refs.length >= 2, "expected FK references on the new columns");
  for (const r of refs) {
    assert.match(r, /on delete set null/, `must not cascade: ${r}`);
  }
});

test("no backfill and no destructive statements", () => {
  assert.doesNotMatch(sql, /\bupdate\s+public\./i, "no backfill — decided 2026-08-13");
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b/i, "nothing is dropped");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contribution-attribution-schema.test.mjs`
Expected: FAIL — `ENOENT`, the migration file does not exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260813180000_contribution_attribution.sql`:

```sql
-- Contribution attribution: who added this Happy Hour content.
--
-- Nothing recorded this before. On 2026-08-13 production held 136 menus and
-- 219 windows with no author at all, because the only contributor record in
-- the schema (intake_submissions.submitted_by) is written on a branch that
-- requires a submitter who cannot publish — and everyone contributing could.
--
-- created_by_tier snapshots the contributor's tier AT WRITE TIME. Roles
-- change: a super user who later joins an org as an owner must not
-- retroactively vanish from past standings. Deriving the tier at query time
-- would rewrite history every time someone's role changed.
--
-- No backfill. Existing rows stay NULL — nobody is credited for work we
-- cannot prove they did.

alter table public.menus
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by_tier text
    check (created_by_tier in ('admin','owner','super_user','user'));

alter table public.happy_hour_windows
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by_tier text
    check (created_by_tier in ('admin','owner','super_user','user'));

-- venue_events.created_by already exists and is already written by both the
-- console (event-actions.ts) and intake (commit/route.ts). Only the tier is new.
alter table public.venue_events
  add column if not exists created_by_tier text
    check (created_by_tier in ('admin','owner','super_user','user'));

-- Partial indexes for the piece-2 leaderboard aggregation. Attributed rows are
-- a small minority today and will stay a minority of all historical rows, so
-- indexing only non-NULL keeps these cheap.
create index if not exists menus_created_by_idx
  on public.menus (created_by) where created_by is not null;
create index if not exists happy_hour_windows_created_by_idx
  on public.happy_hour_windows (created_by) where created_by is not null;
create index if not exists venue_events_created_by_idx
  on public.venue_events (created_by) where created_by is not null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/contribution-attribution-schema.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Apply the migration locally and confirm the columns exist**

Run: `npx supabase db reset`
Then verify: `npx supabase db diff --schema public` — expect no pending diff.

If Supabase is not running locally, run `npm run supabase:start` first.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260813180000_contribution_attribution.sql test/contribution-attribution-schema.test.mjs
git commit -m "feat(attribution): add created_by and created_by_tier columns

Nothing recorded who contributed Happy Hour content: 0 of 136 menus and 0 of
219 windows carried an author. Adds nullable attribution columns to menus,
happy_hour_windows, and venue_events (which already had created_by).

created_by_tier snapshots the tier at write time so a later role change cannot
rewrite past standings. No backfill; existing rows stay NULL."
```

---

### Task 2: Shared tier helper

**Files:**
- Create: `apps/web/src/utils/contribution-attribution.ts`
- Test: `test/contribution-attribution-tier.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ContributorTier = 'admin' | 'owner' | 'super_user' | 'user'`
  - `function consoleContributorTier(isPlatformAdmin: boolean): ContributorTier`

Tasks 3–6 import these. `IntakeTier` from `@/utils/intake-access` is `'admin' | 'owner' | 'super_user'`, a strict subset of `ContributorTier`, so intake sites assign it directly with no mapping.

- [ ] **Step 1: Write the failing test**

Create `test/contribution-attribution-tier.test.mjs`:

```javascript
// test/contribution-attribution-tier.test.mjs
//
// The tier written alongside created_by decides who appears on the
// leaderboard. Getting it wrong silently mis-files a contribution forever,
// because the value is a snapshot that is never recomputed.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, "..", "apps/web/src/utils/contribution-attribution.ts"),
  "utf8",
);

test("ContributorTier lists exactly the four tiers the DB constraint allows", () => {
  // Drift between this union and the migration's CHECK is a runtime 23514 at
  // write time, on a path the user cannot retry.
  const union = src.match(/export type ContributorTier =([^;]*);/);
  assert.ok(union, "ContributorTier must be exported");
  for (const tier of ["admin", "owner", "super_user", "user"]) {
    assert.ok(union[1].includes(`'${tier}'`), `${tier} missing from the union`);
  }
});

test("console writers are admin or owner, never super_user", () => {
  // Super users never write through the console actions — they go through
  // intake, which always drafts for review. A console write that claimed
  // super_user would put an unreviewed row on the board.
  assert.match(src, /export function consoleContributorTier/);
  const fn = src.slice(src.indexOf("export function consoleContributorTier"));
  assert.match(fn, /'admin'/);
  assert.match(fn, /'owner'/);
  assert.doesNotMatch(fn.slice(0, fn.indexOf("}")), /'super_user'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contribution-attribution-tier.test.mjs`
Expected: FAIL — `ENOENT`, the util does not exist.

- [ ] **Step 3: Write the helper**

Create `apps/web/src/utils/contribution-attribution.ts`:

```typescript
/**
 * Who gets credit for a piece of Happy Hour content.
 *
 * The tier is written ALONGSIDE created_by and never recomputed. Roles change
 * — a super user who later joins an org as an owner must not retroactively
 * change how their past contributions are counted — so the value stored here
 * is a snapshot of the contributor at the moment they contributed.
 *
 * This union must stay in lockstep with the created_by_tier CHECK constraint
 * in 20260813180000_contribution_attribution.sql. A value outside the
 * constraint fails the insert with a 23514 at write time.
 */
export type ContributorTier = 'admin' | 'owner' | 'super_user' | 'user';

/**
 * The tier for a console (server-action) writer.
 *
 * Only two are reachable here. Super users have no console write path — they
 * contribute through intake, which always drafts for review — and regular
 * users cannot contribute at all yet (getIntakeTier returns null for them).
 */
export function consoleContributorTier(isPlatformAdmin: boolean): ContributorTier {
  return isPlatformAdmin ? 'admin' : 'owner';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/contribution-attribution-tier.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace web`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/utils/contribution-attribution.ts test/contribution-attribution-tier.test.mjs
git commit -m "feat(attribution): add ContributorTier and the console tier helper

The tier is a snapshot written next to created_by and never recomputed, so the
union here must stay in lockstep with the migration's CHECK constraint."
```

---

### Task 3: Attribute the venue-actions sites

**Files:**
- Modify: `apps/web/src/actions/venue-actions.ts` (helper returns ~line 78 and ~line 110; `happy_hour_windows` insert ~line 430; `menus` insert ~line 649)
- Test: `test/contribution-attribution-sites.test.mjs`

**Interfaces:**
- Consumes: `consoleContributorTier`, `ContributorTier` from `@/utils/contribution-attribution`.
- Produces: `requireVenueScopedWriteAccess` (and therefore `requireVenueManagementAccess` / `requireVenueContentAccess`) now also returns `actor: { id: string; tier: ContributorTier }`.

`requireVenueScopedWriteAccess` currently returns `{ supabase, writeSupabase }` from two places: an early return for platform admins (before the membership lookup) and a final return for org members. Both need `actor`.

- [ ] **Step 1: Write the failing test**

Create `test/contribution-attribution-sites.test.mjs`:

```javascript
// test/contribution-attribution-sites.test.mjs
//
// Every insert into an attributed table must supply created_by and
// created_by_tier. This file grows one assertion per site as sites are
// migrated; Task 7 replaces it with an enumerating guard that also catches
// insert sites added in the future.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/** The object literal passed to the Nth `.from(table).insert({...})` in src. */
function insertPayload(src, table, occurrence = 1) {
  let idx = -1;
  for (let i = 0; i < occurrence; i++) {
    idx = src.indexOf(`.from('${table}')`, idx + 1);
    assert.notEqual(idx, -1, `insert #${occurrence} into ${table} not found`);
  }
  const insertIdx = src.indexOf(".insert(", idx);
  assert.notEqual(insertIdx, -1, `no .insert() after .from('${table}')`);
  const open = src.indexOf("{", insertIdx);
  // Walk braces so nested objects don't truncate the payload.
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in ${table} insert`);
}

test("venue-actions createMenu attributes the menu", () => {
  const payload = insertPayload(read("apps/web/src/actions/venue-actions.ts"), "menus");
  assert.match(payload, /created_by:/, "menus insert must set created_by");
  assert.match(payload, /created_by_tier:/, "menus insert must set created_by_tier");
});

test("venue-actions addHappyHour attributes the window", () => {
  const payload = insertPayload(
    read("apps/web/src/actions/venue-actions.ts"),
    "happy_hour_windows",
  );
  assert.match(payload, /created_by:/);
  assert.match(payload, /created_by_tier:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: FAIL — both tests, "menus insert must set created_by".

- [ ] **Step 3: Return the actor from the access helper**

In `apps/web/src/actions/venue-actions.ts`, add the import at the top with the other `@/utils` imports:

```typescript
import { consoleContributorTier } from '@/utils/contribution-attribution';
```

Change the platform-admin early return inside `requireVenueScopedWriteAccess`:

```typescript
  if (isPlatformAdmin) {
    return {
      supabase,
      writeSupabase: serviceSupabase ?? supabase,
      actor: { id: user.id, tier: consoleContributorTier(true) },
    };
  }
```

Change the final return of the same function:

```typescript
  return {
    supabase,
    writeSupabase: supabase,
    actor: { id: user.id, tier: consoleContributorTier(false) },
  };
```

- [ ] **Step 4: Attribute the two inserts**

In `createMenu`, destructure `actor` and add the two fields:

```typescript
  const { writeSupabase, actor } = await requireVenueManagementAccess(orgId, venueId);
```

```typescript
  const { data: inserted, error } = await writeSupabase.from('menus').insert({
    org_id: orgId,
    venue_id: venueId,
    scope: 'venue',
    name,
    status: HH_STATUS_DRAFT,
    is_active: true,
    created_by: actor.id,
    created_by_tier: actor.tier,
  }).select('id');
```

In `addHappyHour`, destructure `actor` from its existing `requireVenue…Access` call the same way, then:

```typescript
  const { data: inserted, error } = await writeSupabase.from('happy_hour_windows').insert({
    venue_id: venueId,
    dow,
    start_time,
    end_time,
    timezone,
    status: HH_STATUS_DRAFT,
    label,
    created_by: actor.id,
    created_by_tier: actor.tier,
  }).select('id');
```

- [ ] **Step 5: Run test and typecheck**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: PASS, 2 tests.

Run: `npm run typecheck --workspace web`
Expected: clean. If another caller destructures the helper's return, TypeScript is fine — adding a property is backward compatible.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/actions/venue-actions.ts test/contribution-attribution-sites.test.mjs
git commit -m "feat(attribution): attribute console menu and window creation

requireVenueScopedWriteAccess already had the user; it just never handed it to
the insert. Both of its return paths now carry the actor."
```

---

### Task 4: Attribute organization-actions and menu-tree

**Files:**
- Modify: `apps/web/src/actions/organization-actions.ts` (helper's three returns ~lines 48-67; `menus` insert ~line 229)
- Modify: `apps/web/src/actions/menu-tree.ts` (insert ~line 175, plus the `opts` type and its five callers)
- Modify: `test/contribution-attribution-sites.test.mjs`

**Interfaces:**
- Consumes: `consoleContributorTier`, `ContributorTier`.
- Produces: `requireOrgMenuManagementAccess` returns `actor: { id: string; tier: ContributorTier }`; `cloneMenuTreeToVenue`'s `opts` gains `actor: { id: string; tier: ContributorTier }`.

`menu-tree.ts` inserts are menu **copies** (`source_menu_id` is set). They are attributed for audit, but piece 2 excludes copies from scoring via `source_menu_id is not null`. Do not add scoring logic here.

**The caller graph, verified 2026-08-13.** The insert at line 175 lives in
`cloneMenuTreeToVenue` — a *private* function at line 164. It is called from exactly two
places, both inside `menu-tree.ts`:

| Caller | Line | Exported | External call sites |
|---|---|---|---|
| `cloneOrganizationMenuToVenue` | 134 (calls at 143) | yes | 2 |
| `cloneVenueMenuToVenue` | 149 (calls at 158) | yes | 2 |

`replaceMenuTreeFromSource`, `syncVenueMenuFromOrganizationMenu` and
`syncOrganizationMenuCopies` do **not** reach this insert directly. If they call one of
the two clone functions, TypeScript will flag them when the required parameter is added;
follow the compiler rather than assuming either way.

- [ ] **Step 1: Write the failing test**

Append to `test/contribution-attribution-sites.test.mjs`:

```javascript
test("organization-actions createOrganizationMenu attributes the menu", () => {
  const payload = insertPayload(read("apps/web/src/actions/organization-actions.ts"), "menus");
  assert.match(payload, /created_by:/);
  assert.match(payload, /created_by_tier:/);
});

test("menu-tree copies are attributed for audit", () => {
  // A copied menu carries source_menu_id, which is how piece 2 excludes it
  // from scoring. Attribution here is for the audit trail, not for credit —
  // crediting copies would let one menu be farmed across many venues.
  const src = read("apps/web/src/actions/menu-tree.ts");
  const payload = insertPayload(src, "menus");
  assert.match(payload, /created_by:/);
  assert.match(payload, /created_by_tier:/);
  assert.match(payload, /source_menu_id/, "copies must keep source_menu_id set");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: FAIL on the two new tests; the two from Task 3 still pass.

- [ ] **Step 3: Attribute organization-actions**

Add the import:

```typescript
import { consoleContributorTier } from '@/utils/contribution-attribution';
```

`requireOrgMenuManagementAccess` returns `{ writeSupabase }` from three places. Add `actor` to each — the admin branches use `true`, the member branch uses `false`:

```typescript
    return { writeSupabase: lookupClient, actor: { id: auth.user.id, tier: consoleContributorTier(true) } };
```

```typescript
    return { writeSupabase: getAdminClient(), actor: { id: auth.user.id, tier: consoleContributorTier(true) } };
```

```typescript
  return { writeSupabase: supabase, actor: { id: auth.user.id, tier: consoleContributorTier(false) } };
```

Then in `createOrganizationMenu`:

```typescript
  const { writeSupabase, actor } = await requireOrgMenuManagementAccess(orgId);
```

```typescript
  const { error } = await writeSupabase
    .from('menus')
    .insert({
      org_id: orgId,
      venue_id: null,
      source_menu_id: null,
      scope: 'organization',
      name,
      status: HH_STATUS_DRAFT,
      is_active: true,
      created_by: actor.id,
      created_by_tier: actor.tier,
    });
```

- [ ] **Step 4: Thread the actor through menu-tree**

`cloneMenuTreeToVenue` receives no user context — it takes a Supabase client, a source menu, and an `opts` object. Add the actor to `opts`:

```typescript
  opts: {
    orgId: string;
    venueId: string;
    status?: 'draft' | 'published';
    sourceMenuId: string | null;
    actor: { id: string; tier: ContributorTier };
  },
```

Add the import at the top of `menu-tree.ts`:

```typescript
import type { ContributorTier } from '@/utils/contribution-attribution';
```

Then the insert:

```typescript
    .insert({
      org_id: opts.orgId,
      venue_id: opts.venueId,
      source_menu_id: opts.sourceMenuId,
      scope: 'venue',
      name: sourceMenu.name,
      status: opts.status ?? 'draft',
      is_active: sourceMenu.is_active,
      created_by: opts.actor.id,
      created_by_tier: opts.actor.tier,
    })
```

Then update its two internal callers, `cloneOrganizationMenuToVenue` (call at line 143) and `cloneVenueMenuToVenue` (call at line 158). Add an `actor: { id: string; tier: ContributorTier }` parameter to each exported signature and pass it straight into the `cloneMenuTreeToVenue` `opts`.

Each of those two has 2 external call sites. Run `npm run typecheck --workspace web` and work the list the compiler produces until it is clean — callers reached from `venue-actions.ts` and `organization-actions.ts` already have `actor` in scope from Task 3 and this task's Step 3.

**If the compiler surfaces a caller with no human actor in scope** — a scheduled or system-initiated sync — do not invent one and do not pass a placeholder id. That is a machine write, and the global constraint says machine writes stay unattributed. Make `actor` optional on that exported function only, and insert:

```typescript
      created_by: opts.actor?.id ?? null,
      created_by_tier: opts.actor?.tier ?? null,
```

Leave the two clone functions' `actor` required — every path that reaches them today originates from a signed-in console user.

- [ ] **Step 5: Run test and typecheck**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: PASS, 4 tests.

Run: `npm run typecheck --workspace web`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/actions/organization-actions.ts apps/web/src/actions/menu-tree.ts test/contribution-attribution-sites.test.mjs
git commit -m "feat(attribution): attribute org menus and menu-tree copies

Menu-tree inserts are copies, not authorship. They are attributed for the audit
trail; piece 2 excludes them from scoring via source_menu_id, so cloning one
menu across venues cannot farm leaderboard points."
```

---

### Task 5: Add the tier to event-actions

**Files:**
- Modify: `apps/web/src/actions/event-actions.ts` (insert ~line 138)
- Modify: `test/contribution-attribution-sites.test.mjs`

**Interfaces:**
- Consumes: `consoleContributorTier`.
- Produces: nothing new.

This site already sets `created_by: userId`. Only the tier is missing. `requireVenueManagementAccess` here is a *different* local function from the one in `venue-actions.ts` and already destructures `{ supabase, user, userId }` from `requireAuth()`.

- [ ] **Step 1: Write the failing test**

Append to `test/contribution-attribution-sites.test.mjs`:

```javascript
test("event-actions createEvent carries the tier alongside its existing created_by", () => {
  // created_by was already set here — this is why venue_events showed 7 of 152
  // rows attributed while menus and windows showed none.
  const payload = insertPayload(read("apps/web/src/actions/event-actions.ts"), "venue_events");
  assert.match(payload, /created_by:/);
  assert.match(payload, /created_by_tier:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: FAIL on the new test only — `created_by:` matches, `created_by_tier:` does not.

- [ ] **Step 3: Return the tier from the local helper**

Add the import:

```typescript
import { consoleContributorTier } from '@/utils/contribution-attribution';
```

`requireVenueManagementAccess` in this file has exactly two return paths, both already carrying `userId`. Add `tier` to each — note this file returns the tier flat rather than nested in an `actor` object, matching its own existing shape.

The platform-admin return (~line 71):

```typescript
  if (isPlatformAdmin) {
    return {
      supabase: serviceSupabase ?? supabase,
      userId,
      tier: consoleContributorTier(true),
    };
  }
```

The final return (~line 99):

```typescript
  return { supabase, userId, tier: consoleContributorTier(false) };
```

- [ ] **Step 4: Attribute the insert**

At the call site (~line 110), destructure the tier:

```typescript
  const { supabase, userId, tier } = await requireVenueManagementAccess(orgId, venueId);
```

Then add one field to the insert, leaving `created_by: userId` as it is:

```typescript
    status: 'draft',
    created_by: userId,
    created_by_tier: tier,
  });
```

- [ ] **Step 5: Run test and typecheck**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: PASS, 5 tests.

Run: `npm run typecheck --workspace web`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/actions/event-actions.ts test/contribution-attribution-sites.test.mjs
git commit -m "feat(attribution): record the contributor tier on console events

created_by was already written here; only the tier snapshot was missing."
```

---

### Task 6: Attribute the three intake commit sites

**Files:**
- Modify: `apps/web/src/app/api/intake/commit/route.ts` (`happy_hour_windows` ~line 304, `menus` ~line 328, `venue_events` ~line 449)
- Modify: `test/contribution-attribution-sites.test.mjs`

**Interfaces:**
- Consumes: `IntakeTier` from `@/utils/intake-access` (already imported in this route).
- Produces: nothing new.

`tier` is already computed and in scope in this handler — `getIntakeTier` runs before any write. `IntakeTier` (`'admin' | 'owner' | 'super_user'`) is a strict subset of `ContributorTier`, so it is assigned directly with no mapping. This is the path a super user takes, so it is the path that actually populates the leaderboard.

- [ ] **Step 1: Write the failing test**

Append to `test/contribution-attribution-sites.test.mjs`:

```javascript
test("intake commit attributes menus and windows", () => {
  const src = read("apps/web/src/app/api/intake/commit/route.ts");

  // Windows are inserted from a prebuilt array, so assert on its construction
  // rather than the .insert() payload.
  assert.match(src, /newWindowRows[\s\S]{0,400}?created_by:/, "window rows need created_by");
  assert.match(src, /newWindowRows[\s\S]{0,400}?created_by_tier:/, "window rows need the tier");

  const menuPayload = insertPayload(src, "menus");
  assert.match(menuPayload, /created_by:/);
  assert.match(menuPayload, /created_by_tier:/);
});

test("intake events carry the tier through buildEventRows", () => {
  // Events are not built inline. The route passes camelCase options into
  // buildEventRows, which writes the snake_case column — so the two halves are
  // asserted in the two different files that actually contain them.
  const route = read("apps/web/src/app/api/intake/commit/route.ts");
  assert.match(route, /createdByTier:\s*tier/, "route must pass the resolved tier");

  const helper = read("apps/web/src/utils/intake-content.ts");
  assert.match(helper, /createdByTier:\s*ContributorTier/, "opts must declare the tier");
  assert.match(helper, /created_by_tier:\s*opts\.createdByTier/, "row must set the column");
});

test("intake passes the resolved tier, never a hardcoded string", () => {
  // A hardcoded 'owner' here would file every super user's contribution under
  // the wrong tier, and the leaderboard filters on exactly that column.
  const route = read("apps/web/src/app/api/intake/commit/route.ts");
  assert.doesNotMatch(route, /created_by_tier:\s*'(admin|owner|super_user|user)'/);
  assert.doesNotMatch(route, /createdByTier:\s*'(admin|owner|super_user|user)'/);
  assert.match(route, /created_by_tier:\s*tier/, "menu and window rows use the resolved tier");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: FAIL on both new tests.

- [ ] **Step 3: Attribute all three inserts**

Where `newWindowRows` is built (just above the insert at ~line 304), add both fields to each row object:

```typescript
      created_by: user.id,
      created_by_tier: tier,
```

In the `menus` insert (~line 328), add the same two fields to the payload object.

Events are not built inline — the rows come from `buildEventRows` in `apps/web/src/utils/intake-content.ts:161`, whose `opts` already carries `createdBy: string | null`. The tier threads through the same helper.

First, in `apps/web/src/utils/intake-content.ts`, add the option (~line 167):

```typescript
    status: 'draft' | 'published';
    createdBy: string | null;
    createdByTier: ContributorTier | null;
```

Import the type at the top of that file:

```typescript
import type { ContributorTier } from '@/utils/contribution-attribution';
```

Then add the column to the object pushed at ~line 186, next to wherever `created_by` is set:

```typescript
      created_by_tier: opts.createdByTier,
```

Finally, in the commit route's `buildEventRows` call (~line 449), pass the resolved tier:

```typescript
    const { rows: eventRows, unschedulable } = buildEventRows(events, {
      venueId: venue_id,
      timezone: (venue?.timezone as string | null) ?? 'America/Chicago',
      // Same publish-or-queue rule as the menu: only someone who can publish
      // this venue gets live events.
      status: save_as_draft ? 'draft' : 'published',
      createdBy: user.id,
      createdByTier: tier,
    });
```

Note `buildEventRows` is covered by `test/intake-content-classification.test.mjs`. Adding a required option changes its signature, so that suite must be re-run — Step 4 does exactly that.

- [ ] **Step 4: Run the full suite and typecheck**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: PASS, 8 tests.

Run: `npm test`
Expected: 0 failures. The existing intake tests must still pass — this task changes insert payloads that `test/intake-venue.test.mjs` and `test/intake-review-routing.test.mjs` touch, and it changes the `buildEventRows` signature that `test/intake-content-classification.test.mjs` exercises.

Run: `npm run typecheck --workspace web`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/intake/commit/route.ts test/contribution-attribution-sites.test.mjs
git commit -m "feat(attribution): attribute intake commits with the resolved tier

This is the path super users take, so it is the path that will actually
populate the leaderboard. IntakeTier is a subset of ContributorTier, so the
already-resolved tier is written directly rather than re-derived."
```

---

### Task 7: Regression guard for future insert sites

**Files:**
- Modify: `test/contribution-attribution-sites.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

The per-site tests above prove today's eight sites are attributed. They do not catch a **ninth** site added next month — which is precisely the failure mode that produced 0 attributed menus and 7 of 152 events. This task adds an enumerating guard.

- [ ] **Step 1: Write the failing test**

Append to `test/contribution-attribution-sites.test.mjs`:

```javascript
import { readdirSync, statSync } from "node:fs";

/** Every .ts/.tsx file under apps/web/src. */
function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

test("EVERY insert into an attributed table sets created_by and created_by_tier", () => {
  // The guard that the earlier per-site tests cannot provide: it fails for a
  // site nobody has written yet. Attribution was missed for 136 menus because
  // nothing checked, and nothing would have caught the next omission either.
  const ATTRIBUTED = ["menus", "happy_hour_windows", "venue_events"];
  const offenders = [];

  for (const file of sourceFiles(join(repoRoot, "apps/web/src"))) {
    const src = readFileSync(file, "utf8");
    for (const table of ATTRIBUTED) {
      let idx = src.indexOf(`.from('${table}')`);
      while (idx !== -1) {
        const after = src.slice(idx, idx + 1200);
        // Only inserts matter. Selects, updates and deletes are not authorship.
        if (/^\s*\.\s*insert\(/m.test(after.slice(after.indexOf(")") + 1))) {
          if (!/created_by\b/.test(after) || !/created_by_tier\b/.test(after)) {
            offenders.push(`${file.replace(repoRoot + "/", "")} → ${table}`);
          }
        }
        idx = src.indexOf(`.from('${table}')`, idx + 1);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these inserts do not attribute their contributor:\n  ${offenders.join("\n  ")}`,
  );
});
```

- [ ] **Step 2: Run the test**

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: PASS. All eight sites were fixed in Tasks 3–6, so the guard finds no offenders.

If it fails, the reported path is a site the earlier tasks missed — attribute it the same way, then re-run.

- [ ] **Step 3: Prove the guard has teeth**

Temporarily delete the `created_by_tier:` line from the `createMenu` insert in `apps/web/src/actions/venue-actions.ts`, then run:

Run: `node --test test/contribution-attribution-sites.test.mjs`
Expected: FAIL, naming `apps/web/src/actions/venue-actions.ts → menus`.

Restore the line with `git checkout apps/web/src/actions/venue-actions.ts` and re-run to confirm PASS. A guard that cannot fail is not a guard.

- [ ] **Step 4: Commit**

```bash
git add test/contribution-attribution-sites.test.mjs
git commit -m "test(attribution): fail when any insert site skips attribution

The per-site tests prove today's eight sites are correct; they cannot catch a
ninth added later, which is exactly how 136 menus ended up unattributed. This
walks apps/web/src and fails on any insert into an attributed table that omits
created_by or created_by_tier. Mutation-checked."
```

---

### Task 8: Correct the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-08-13-contribution-attribution-design.md`

**Interfaces:** none.

Implementation found two errors in the merged spec. Leaving them makes the spec misleading for pieces 2 and 3.

- [ ] **Step 1: Fix the write-path table**

In the eight-row table, change the `actions/event-actions.ts:138` row's "Today" cell from `unattributed` to:

```
sets `created_by` (line 154)
```

And correct the sentence beneath the table. Replace:

> Only site 8 attributes anything today, which is why `venue_events` shows 7 of 152 rows attributed and the other two tables show none.

with:

> Sites 7 and 8 — both `venue_events` writers — already set `created_by`, which is why that table shows 7 of 152 rows attributed while `menus` and `happy_hour_windows` show none. Both still need `created_by_tier`.

- [ ] **Step 2: Document the menu-copy finding**

Add to the Design section, after the write-path table:

```markdown
### Menu copies are attributed but not credited

`actions/menu-tree.ts:175` is the shared insert behind `cloneOrganizationMenuToVenue`,
`cloneVenueMenuToVenue`, `replaceMenuTreeFromSource`, `syncVenueMenuFromOrganizationMenu`
and `syncOrganizationMenuCopies`. These create `menus` rows by copying an existing menu,
which is not authorship. Crediting them would let one menu be farmed across many venues —
the same gaming vector that excluded menu items.

Every copy carries a non-NULL `source_menu_id`, so piece 2 excludes copies at scoring
time with `where source_menu_id is null`. This piece still records `created_by` on
copies, because knowing who cloned a menu has audit value even when it earns nothing.
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-13-contribution-attribution-design.md
git commit -m "docs(spec): correct two findings from implementation

event-actions already sets created_by, so venue_events had two attributing
writers rather than one. And menu-tree's insert is the copy/sync helper, which
must be attributed for audit but excluded from scoring via source_menu_id."
```

---

## Done when

- `npm test` passes with 0 failures. Baseline is 529; this plan adds 16 tests
  (5 schema + 2 tier helper + 9 insert-site), so expect 545.
- `npm run typecheck --workspace web` is clean.
- The migration applies on a fresh `npx supabase db reset`.
- The regression guard fails when any insert site drops attribution, verified by mutation.
- No existing row was backfilled: `select count(*) from menus where created_by is not null` returns 0 immediately after deploy, and rises only as new content is added.

## Explicitly not in this plan

- Scoring, weights, and the `source_menu_id` exclusion — piece 2.
- The public leaderboard page, city rollups, the `LEADERBOARD_ENABLED` toggle, and the `SECURITY DEFINER` read — piece 3.
- Opening contribution to regular users — a change to `getIntakeTier` with real moderation load.
- Backfilling the 136 existing menus.
- The `menus.created_by` anon-readability question, flagged in the spec and deliberately left open.
