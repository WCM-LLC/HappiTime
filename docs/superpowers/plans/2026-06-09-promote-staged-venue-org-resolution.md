# Promote Staged Venue — Org Match-or-Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Promote" on a staged venue resolve the org automatically — attach to a name-matching existing org, else create a new (ownerless) org — while keeping an explicit "attach to a specific org" override. Implements `docs/superpowers/specs/2026-06-09-promote-staged-venue-org-resolution-design.md`.

**Architecture:** A new pure-I/O helper `resolveOrgForVenue(supabase, venueName)` does match-or-create using the EXISTING SQL dedup functions (`normalize_organization_name`, `organization_slugify`) via RPCs, so name normalization never drifts between JS and SQL. The promote action makes `orgId` optional and delegates to the helper when none is passed. The UI defaults to auto and keeps the org dropdown as an override.

**Tech Stack:** Next.js server actions (`apps/web`), `@supabase/supabase-js` service-role client, `node --test` (`.mjs` utils — the repo's `scan-analytics.mjs` pattern).

> **REVISED DURING EXECUTION (slug-based):** `normalize_organization_name` /
> `organization_slugify` were dropped in the 2026-06-01 reconciliation, and
> `create_organization` is a no-op stub. **Task 0 (the `find_org_by_name` migration)
> is dropped — no migration is added.** Matching is by **slug** instead, reusing the
> app's existing `slugify` util + a `findOrgIdBySlug` lookup (the same dedup the app's
> `createOrganization` uses; `slugify` collapses apostrophes/case). The helper takes a
> precomputed `slug` so it stays pure-I/O. As implemented:
> - `apps/web/src/utils/org-resolution.mjs` (+ `.d.ts`) — `resolveOrgForVenue(supabase, { name, slug, createdBy? })`
> - `test/promote-org-resolution.test.mjs` — integration test (skips without local env), verified: create + ownerless + reuse
> - `admin-staging-actions.ts` — `orgId?` optional; computes `slugify(name)`, calls the helper, inserts venue with the resolved id, returns `{ …, orgId, orgCreated, orgName }`
> - `PromoteForm` — Auto (match/create) vs "Attach to existing" override; `venueName` threaded from both call sites

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260609140000_find_org_by_name.sql` | RPC `find_org_by_name(text) → uuid` — oldest org whose normalized name matches (only if not already present) |
| `apps/web/src/utils/org-resolution.mjs` | `resolveOrgForVenue(supabase, venueName)` — match-or-create, returns `{ orgId, orgName, created }` |
| `test/promote-org-resolution.test.mjs` | Integration test (skips without local Supabase env) |
| `apps/web/src/actions/admin-staging-actions.ts` | `adminPromoteStagingVenue` — `orgId` optional, delegate to helper |
| `apps/web/src/app/admin/staging/_components/StagingActions.tsx` | `PromoteForm` — auto default + override dropdown |

---

## Task 0: Matching RPC (DB)

**Files:** Create `supabase/migrations/20260609140000_find_org_by_name.sql`

- [ ] **Step 1: Confirm it doesn't already exist**

Run: `docker exec -i supabase_db_ujflcrjsiyhofnomurco psql -U postgres -d postgres -At -c "select proname from pg_proc where proname='find_org_by_name';"`
Expected: empty (if it prints `find_org_by_name`, skip this task and reuse it).

- [ ] **Step 2: Write the migration**

```sql
-- Oldest organization whose normalized name matches the input (dedup match for
-- staged-venue promotion). Uses the canonical normalize fn so JS never re-implements it.
create or replace function public.find_org_by_name(p_name text)
returns uuid
language sql
stable
as $$
  select id
  from public.organizations
  where normalize_organization_name(name) = normalize_organization_name(p_name)
  order by created_at asc
  limit 1;
$$;

revoke all on function public.find_org_by_name(text) from public, anon, authenticated;
-- service-role (used by the admin action) bypasses grants; no broader grant needed.
```

- [ ] **Step 3: Apply locally + sanity check**

Run: `supabase db reset` then
`docker exec -i supabase_db_ujflcrjsiyhofnomurco psql -U postgres -d postgres -At -c "select public.find_org_by_name('Nonexistent Place 12345');"`
Expected: empty (no match). (Drift gate: `supabase db diff --linked` should show only this new function before shipping.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260609140000_find_org_by_name.sql
git commit -m "feat(db): find_org_by_name RPC for staged-venue org match"
```

---

## Task 1: `resolveOrgForVenue` helper + test

**Files:**
- Create: `apps/web/src/utils/org-resolution.mjs`
- Test: `test/promote-org-resolution.test.mjs`

Contract: `resolveOrgForVenue(supabase, venueName)` → `{ orgId, orgName, created }`.
1. `find_org_by_name(venueName)` → if a uuid comes back, return `{ orgId, orgName: venueName, created: false }`.
2. Else create: `organization_slugify(venueName)` → unique slug (retry suffix on slug `23505`/conflict, max 6) → `insert { name: venueName, slug }` → `{ orgId, orgName: venueName, created: true }`.
3. On insert slug-unique race (`23505`), re-run `find_org_by_name` and return that match (treat as found).

- [ ] **Step 1: Write the failing test** (`test/promote-org-resolution.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { resolveOrgForVenue } from "../apps/web/src/utils/org-resolution.mjs";

const URL = process.env.LOCAL_SUPABASE_URL;      // e.g. http://127.0.0.1:54321
const KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL || !KEY;

test("resolveOrgForVenue: creates when no match, reuses on normalized match", { skip: skip && "LOCAL_SUPABASE_URL / SERVICE_ROLE_KEY not set" }, async () => {
  const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
  const unique = `Test Bar ${Date.now()}`;

  const a = await resolveOrgForVenue(supabase, unique);
  assert.equal(a.created, true);
  assert.ok(a.orgId);

  // Exact name again → reuse
  const b = await resolveOrgForVenue(supabase, unique);
  assert.equal(b.created, false);
  assert.equal(b.orgId, a.orgId);

  // Normalized variant (apostrophe/case) → reuse the same org
  const c = await resolveOrgForVenue(supabase, unique.replace(/ /g, "  ").toUpperCase());
  assert.equal(c.orgId, a.orgId);

  // cleanup
  await supabase.from("organizations").delete().eq("id", a.orgId);
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `node --test test/promote-org-resolution.test.mjs` · Expected: FAIL ("Cannot find module org-resolution.mjs"). (With env unset, it SKIPs — set `LOCAL_SUPABASE_URL`/`LOCAL_SUPABASE_SERVICE_ROLE_KEY` from `supabase status` to actually run.)

- [ ] **Step 3: Implement `org-resolution.mjs`**

```js
/** Match-or-create an organization for a staged venue. service-role client only. */
export async function resolveOrgForVenue(supabase, venueName) {
  const name = String(venueName ?? "").trim();
  if (!name) throw new Error("venueName is required to resolve an org");

  const { data: matchId } = await supabase.rpc("find_org_by_name", { p_name: name });
  if (matchId) return { orgId: matchId, orgName: name, created: false };

  const { data: baseSlug, error: slugErr } = await supabase.rpc("organization_slugify", { input: name });
  if (slugErr || !baseSlug) throw new Error("Failed to generate org slug");

  let slug = baseSlug;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const { data: created, error } = await supabase
      .from("organizations")
      .insert({ name, slug })
      .select("id")
      .single();

    if (!error) return { orgId: created.id, orgName: name, created: true };
    if (error.code !== "23505") throw new Error(error.message);

    // Unique violation: could be slug (retry) or a concurrent same-name create (match).
    const { data: raced } = await supabase.rpc("find_org_by_name", { p_name: name });
    if (raced) return { orgId: raced, orgName: name, created: false };
    const { data: next } = await supabase.rpc("organization_slugify", { input: `${name} ${attempt + 1}` });
    slug = next ?? `${slug}-${attempt + 1}`;
  }
  throw new Error("Could not generate a unique org slug. Try again.");
}
```

- [ ] **Step 4: Run the test (with local env set)** — Expected: PASS (create, reuse, normalized-reuse).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/org-resolution.mjs test/promote-org-resolution.test.mjs
git commit -m "feat(web): resolveOrgForVenue match-or-create helper + test"
```

---

## Task 2: Wire into `adminPromoteStagingVenue`

**Files:** Modify `apps/web/src/actions/admin-staging-actions.ts:6` (signature + org resolution)

- [ ] **Step 1: Make `orgId` optional and resolve**

Change the signature to `adminPromoteStagingVenue(stagingId: string, orgId?: string)`. After the existing payload validation (the `name`/`city`/`state`/`zip` block, ~lines 19-26) and BEFORE the venue insert, resolve the org:

```ts
import { resolveOrgForVenue } from "@/utils/org-resolution.mjs";

// ...inside the action, after name/city/state/zip validation, before slug generation:
let resolvedOrgId = orgId ?? null;
let orgCreated = false;
let orgName: string | null = null;
if (!resolvedOrgId) {
  const r = await resolveOrgForVenue(supabase, name);
  resolvedOrgId = r.orgId;
  orgCreated = r.created;
  orgName = r.orgName;
}
```

- [ ] **Step 2: Use `resolvedOrgId` in the venue insert**

Change `org_id: orgId,` (line ~74) to `org_id: resolvedOrgId,`.

- [ ] **Step 3: Extend the return**

Change the final `return { venueId: newVenue!.id, alreadyExisted: false };` to:

```ts
return { venueId: newVenue!.id, alreadyExisted: false, orgId: resolvedOrgId, orgCreated, orgName };
```

(The early `places_id` dedupe return stays as-is; it never reaches org resolution.)

- [ ] **Step 4: Type-check** — Run: `npm run -w apps/web typecheck` (or the repo's web typecheck). Expected: no errors; callers passing `orgId` still compile (optional param is backward-compatible).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/admin-staging-actions.ts
git commit -m "feat(web): promote staged venue auto-resolves org (match-or-create)"
```

---

## Task 3: `PromoteForm` UI

**Files:** Modify `apps/web/src/app/admin/staging/_components/StagingActions.tsx` (`PromoteForm`, ~lines 8-80)

Current: a required `<select>` of orgs + "Select an organization" error. New: default Auto, optional override.

- [ ] **Step 1: Add an Auto/Override toggle**

- Add state `const [mode, setMode] = useState<'auto' | 'existing'>('auto');`
- Render a radio/segmented control: **Auto (match or create org from venue name)** | **Attach to existing org**.
- When `mode === 'existing'`, show the existing `<select>` (unchanged).
- Pass the venue name in as a prop (`venueName: string`) so Auto mode can show the preview line: `Auto: will match or create org "{venueName}".`

- [ ] **Step 2: Update submit**

```ts
const result = await adminPromoteStagingVenue(rowId, mode === 'existing' ? orgId : undefined);
// toast: result.orgCreated ? `Created org "${result.orgName}"` : `Attached to existing org`
```
Remove the unconditional `if (!orgId) { setErr('Select an organization'); return; }` — only require `orgId` when `mode === 'existing'`.

- [ ] **Step 3: Thread `venueName` from the caller**

In `StagingDetailClient.tsx` where `<PromoteForm ... />` is rendered (~line 137), pass `venueName={payload.name ?? payload.title ?? ''}`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/staging/_components/StagingActions.tsx apps/web/src/app/admin/staging/_components/StagingDetailClient.tsx
git commit -m "feat(web): PromoteForm auto match-or-create org with existing-org override"
```

---

## Task 4: Verify end-to-end (use the `verify` skill)

- [ ] Drive the running console (`apps/web`) on the local stack:
  1. Promote a staged venue with a **brand-new name** in Auto mode → a new org appears, venue attached; toast says "Created org …". Confirm in DB: one new `organizations` row, **no `org_members` row**.
  2. Promote a second staged venue whose name **normalizes to the same** as an existing org (e.g. "O'Dowd's" vs "Odowds") → attaches to the existing org, no duplicate created.
  3. Switch to **Attach to existing** override, pick an org → venue attached to exactly that org.
- Capture the screen + a DB query of `organizations`/`venues` as evidence.

---

## Acceptance (from the spec)
- [ ] Promote works with **no pre-existing org** (creates one); the first-ever venue is promotable.
- [ ] A normalized-name match **reuses** the existing org (no duplicates).
- [ ] The dropdown still attaches to a **specific** existing org.
- [ ] Auto-created orgs are **ownerless** (claimed later); no `org_members` row written.

---

## Self-Review (completed)
- **Spec coverage:** match-or-create → Task 1 + Task 0 RPC; `orgId` optional + return shape → Task 2; auto default + override + removed hard error → Task 3; ownerless create → enforced (helper never writes `org_members`); edge cases (>1 match = oldest via RPC `order by created_at`; slug collision retry; unique race re-match) → Task 1 impl.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type/name consistency:** `resolveOrgForVenue(supabase, venueName)` and its `{ orgId, orgName, created }` shape are identical across Task 1 (def), Task 2 (action), and the test. RPC names `find_org_by_name(p_name)` and `organization_slugify(input)` match their definitions.
- **Note:** the test gates on `LOCAL_SUPABASE_URL`/`LOCAL_SUPABASE_SERVICE_ROLE_KEY` so CI (no local DB) SKIPs it — matching the repo's existing skip-without-env smoke tests; real verification is Task 4 via the `verify` skill.
