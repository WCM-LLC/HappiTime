# Redeemable Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a venue owner/manager pick a preset reward and advertise it, flowing that choice to the public directory, the venue page, and the guest check-in/redemption flow — with the weekly redemption limit enforced in data.

**Architecture:** Two nullable columns on `venues` (`reward_preset`, `reward_active`) hold the config. A single preset→label registry (shared in web/directory, mirrored + parity-tested in mobile) is the only source of labels. The existing `verify-checkin` edge function gains a data-enforced weekly cap on the `redeem` path and returns `reward_preset` so the mobile screens show the configured reward. An owner "Rewards" tab writes the columns via a Server Action; the directory + venue page render a badge/filter/banner when an offer is live.

**Tech Stack:** Supabase Postgres (migrations via the committed-file + `Supabase DB Deploy` pipeline — NOT the MCP tool), Deno edge function (`verify-checkin`), Next.js App Router (Server Components + Server Actions), React Native (Expo) mobile, TypeScript, Tailwind design tokens. Pure logic tested with Deno `Deno.test` (edge fn) and `node --test` `.mjs` (registry parity, mirrors `apps/mobile/src/**/*.test.mjs`).

## Global Constraints

- **Decisions (locked):** one reward per venue (no tiers); earn-it count stays **5**, platform-wide, NOT owner-editable (do not touch `STAMPS_PER_ROUND` or `round_redemptions.checkins_consumed`); reward is **presets only** (no custom free text); advertise on the **public directory** + in-app + venue page; weekly limit **enforced in data**.
- **Preset keys (exact):** `house_draft`, `well_cocktail`, `five_off`, `free_appetizer`. Labels: `A house draft`, `A well cocktail`, `$5 off the tab`, `A free appetizer`.
- **Offer is "live" iff** `reward_preset IS NOT NULL AND reward_active = true`.
- **Migrations:** forward-only, zero-drift. Apply via the committed-migration `Supabase DB Deploy` path. **Do NOT use the Supabase MCP `apply_migration` tool** — it stamps its own version and causes migration-history drift (the exact issue currently blocking db-deploy). Run `get_advisors` (type `security`) after.
- **Column-grant trap:** new user-writable `venues` columns may need `GRANT UPDATE (...) TO authenticated` — verify with `has_column_privilege` (mirrors the `user_profiles` socials fix, PR #106).
- **Done bar:** `npm run typecheck` and `npm run lint` clean; Deno tests pass for `verify-checkin`; `node --test` registry parity passes; CI green on Node 20 (local pass ≠ CI pass). Directory app is NOT covered by CI — verify it with `npm run typecheck --workspace directory` + `npm run build:directory` locally.
- **Types:** after the migration, regenerate `supabase/types/generated.ts` (scoped splice of the `venues` block only — the committed file is ~2000 lines stale; do not full-regen here).

---

### Task 1: Reward preset registry (shared + mobile mirror, parity-tested)

**Files:**
- Create: `packages/shared-types/src/rewards.ts` (or the nearest shared module both Next apps import — confirm by checking `packages/shared-types/index.ts` exports)
- Create: `apps/mobile/src/lib/rewards.mjs`
- Test: `apps/mobile/src/lib/rewards.test.mjs`

**Interfaces:**
- Produces: `REWARD_PRESETS: ReadonlyArray<{ key: string; label: string }>` and `rewardLabel(key: string | null | undefined): string | null` — both in the shared module and mirrored in the mobile `.mjs`.

- [ ] **Step 1: Write the shared registry**

Create `packages/shared-types/src/rewards.ts`:

```ts
// Single source of truth for redeemable-reward presets. Every surface (owner
// console, directory badge, venue banner, mobile screens) renders labels from
// here. Presets only — no custom free text (by product decision).
export const REWARD_PRESETS = [
  { key: 'house_draft', label: 'A house draft' },
  { key: 'well_cocktail', label: 'A well cocktail' },
  { key: 'five_off', label: '$5 off the tab' },
  { key: 'free_appetizer', label: 'A free appetizer' },
] as const;

export type RewardPresetKey = (typeof REWARD_PRESETS)[number]['key'];

export const REWARD_PRESET_KEYS: readonly string[] = REWARD_PRESETS.map((p) => p.key);

export function rewardLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return REWARD_PRESETS.find((p) => p.key === key)?.label ?? null;
}
```

Export it from the package barrel — add to `packages/shared-types/index.ts`:

```ts
export * from './src/rewards';
```

- [ ] **Step 2: Write the failing mobile parity test**

Create `apps/mobile/src/lib/rewards.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { REWARD_PRESETS, rewardLabel } from "./rewards.mjs";

test("preset keys and labels match the canonical list", () => {
  assert.deepEqual(REWARD_PRESETS, [
    { key: "house_draft", label: "A house draft" },
    { key: "well_cocktail", label: "A well cocktail" },
    { key: "five_off", label: "$5 off the tab" },
    { key: "free_appetizer", label: "A free appetizer" },
  ]);
});

test("rewardLabel maps keys, tolerates null/unknown", () => {
  assert.equal(rewardLabel("house_draft"), "A house draft");
  assert.equal(rewardLabel(null), null);
  assert.equal(rewardLabel("nope"), null);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test apps/mobile/src/lib/rewards.test.mjs`
Expected: FAIL — cannot find module `./rewards.mjs`.

- [ ] **Step 4: Write the mobile mirror**

Create `apps/mobile/src/lib/rewards.mjs` (kept byte-identical in data to the shared list; the parity test above is the guard):

```js
// Mirror of packages/shared-types/src/rewards.ts. Kept in sync by rewards.test.mjs.
// Mobile can't import the TS package directly, so this mirror + parity test is
// the seam that prevents drift.
export const REWARD_PRESETS = [
  { key: "house_draft", label: "A house draft" },
  { key: "well_cocktail", label: "A well cocktail" },
  { key: "five_off", label: "$5 off the tab" },
  { key: "free_appetizer", label: "A free appetizer" },
];

export function rewardLabel(key) {
  if (!key) return null;
  const found = REWARD_PRESETS.find((p) => p.key === key);
  return found ? found.label : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test apps/mobile/src/lib/rewards.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/rewards.ts packages/shared-types/index.ts apps/mobile/src/lib/rewards.mjs apps/mobile/src/lib/rewards.test.mjs
git commit -m "feat(rewards): reward preset registry + mobile mirror with parity test"
```

---

### Task 2: Migration — venues reward columns + grant + types

**Files:**
- Create: `supabase/migrations/<timestamp>_venue_reward_config.sql` (use a real UTC timestamp `YYYYMMDDHHMMSS` **greater than** the latest existing migration; do NOT reuse `20260707120000`)
- Modify (scoped splice): `supabase/types/generated.ts`

**Interfaces:**
- Produces: columns `venues.reward_preset` (text, CHECK against the 4 keys, nullable) and `venues.reward_active` (boolean, not null, default false); `authenticated` can UPDATE both.

- [ ] **Step 1: Write the migration SQL**

Create the migration file:

```sql
-- Redeemable Rounds: per-venue reward config.
-- reward_preset = which preset reward guests can redeem (one per venue).
-- reward_active = the "advertise this reward" toggle. Offer is live when
-- reward_preset is not null AND reward_active = true.
alter table public.venues
  add column if not exists reward_preset text
    check (reward_preset in ('house_draft','well_cocktail','five_off','free_appetizer')),
  add column if not exists reward_active boolean not null default false;

-- Owner/manager edits these via the cookie-session (authenticated) client from
-- the venue dashboard. If venues uses column-level UPDATE grants, authenticated
-- needs an explicit grant on the new columns (mirrors the user_profiles lockdown
-- trap). Harmless if venues already grants UPDATE table-wide.
grant update (reward_preset, reward_active) on public.venues to authenticated;
```

- [ ] **Step 2: Apply via the DB-deploy path (NOT the MCP tool)**

Commit the file and let `Supabase DB Deploy` apply it on merge, or apply locally with `supabase db push` against the target using the repo's documented flow in `docs/database-change-policy.md`. Do NOT call the Supabase MCP `apply_migration` tool.

- [ ] **Step 3: Verify columns + grant + advisors**

Run via `execute_sql` (read-only checks are fine through any client):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'venues' and column_name in ('reward_preset','reward_active')
order by column_name;
-- Expected: 2 rows.

select has_column_privilege('authenticated','public.venues','reward_preset','UPDATE') as can_update;
-- Expected: can_update = true.
```

Run `get_advisors` (type `security`): expect no NEW critical finding from these columns.

- [ ] **Step 4: Regenerate types (scoped splice)**

Regenerate the `venues` table block only and splice it into `supabase/types/generated.ts` (Row/Insert/Update gain `reward_preset: string | null` and `reward_active: boolean`). Do not full-regen (the committed file is ~2000 lines stale).

- [ ] **Step 5: Verify the directory can read the new columns**

Confirm whatever the directory selects for venue cards (table or view) exposes `reward_preset`/`reward_active` to `anon`. If the directory reads a view, add the columns to that view in this migration.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_venue_reward_config.sql supabase/types/generated.ts
git commit -m "feat(db): venue reward_preset + reward_active columns"
```

---

### Task 3: verify-checkin — weekly cap + reward passthrough

**Files:**
- Modify: `supabase/functions/verify-checkin/logic.ts`
- Modify: `supabase/functions/verify-checkin/index.ts`
- Test: `supabase/functions/verify-checkin/index.test.ts` (or the co-located logic test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `canRedeemWeekly(lastRedeemedAtMs: number | null, nowMs: number): boolean`. The `redeem` response and check-in response include `reward_preset: string | null`.

- [ ] **Step 1: Write the failing logic test**

Add to `verify-checkin`'s test file (Deno):

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { canRedeemWeekly } from "./logic.ts";

Deno.test("canRedeemWeekly: null last redemption is allowed", () => {
  assertEquals(canRedeemWeekly(null, Date.UTC(2026, 6, 9)), true);
});

Deno.test("canRedeemWeekly: within 7 days is blocked", () => {
  const now = Date.UTC(2026, 6, 9, 12, 0, 0);
  const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
  assertEquals(canRedeemWeekly(threeDaysAgo, now), false);
});

Deno.test("canRedeemWeekly: exactly 7 days later is allowed", () => {
  const now = Date.UTC(2026, 6, 9, 12, 0, 0);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  assertEquals(canRedeemWeekly(sevenDaysAgo, now), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/verify-checkin/` (from repo root, matching the repo's existing Deno test invocation)
Expected: FAIL — `canRedeemWeekly` is not exported.

- [ ] **Step 3: Add the pure helper**

Append to `supabase/functions/verify-checkin/logic.ts`:

```ts
/** One redemption per (user, venue) per 7 days. lastRedeemedAtMs=null → allowed. */
export const REDEEM_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export function canRedeemWeekly(lastRedeemedAtMs: number | null, nowMs: number): boolean {
  if (lastRedeemedAtMs === null) return true;
  return nowMs - lastRedeemedAtMs >= REDEEM_COOLDOWN_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/verify-checkin/`
Expected: PASS.

- [ ] **Step 5: Enforce the cap in the redeem handler**

In `supabase/functions/verify-checkin/index.ts`, import `canRedeemWeekly` alongside the other logic imports. Inside the `if (redeem) {` block, right after `lastRedemptionForRedeem` is fetched (it already queries `created_at`), insert the cap check before the stamps query:

```ts
    const lastRedeemedAtMs = (lastRedemptionForRedeem as { created_at?: string } | null)?.created_at
      ? new Date((lastRedemptionForRedeem as { created_at: string }).created_at).getTime()
      : null;
    if (!canRedeemWeekly(lastRedeemedAtMs, now.getTime())) {
      const nextEligible = new Date(lastRedeemedAtMs! + REDEEM_COOLDOWN_MS).toISOString();
      return json({ error: "weekly_limit_reached", next_eligible_at: nextEligible }, 400);
    }
```

(Import `REDEEM_COOLDOWN_MS` too.)

- [ ] **Step 6: Add reward_preset to the venue select + both responses**

Change the venue select (index.ts ~line 130) to include `reward_preset`:

```ts
    .select("id, org_id, lat, lng, checkin_secret, geofence_radius_m, reward_preset")
```

Add `reward_preset: venue.reward_preset ?? null` to the venue type and to BOTH JSON responses (the `redeem` return and the final check-in return).

- [ ] **Step 7: Run tests + commit**

Run: `deno test supabase/functions/verify-checkin/`
Expected: PASS.

```bash
git add supabase/functions/verify-checkin/
git commit -m "feat(checkin): enforce weekly redemption cap + return reward_preset"
```

Deploy the edge function via the repo's function-deploy path (`supabase functions deploy verify-checkin`) as part of release — note this in the PR.

---

### Task 4: Owner console — Rewards tab + Server Action

**Files:**
- Create: `apps/web/src/app/orgs/[orgId]/venues/[venueId]/RewardConfig.tsx`
- Create: `apps/web/src/actions/reward-actions.ts`
- Modify: `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx` (add a `ShellTab` for Rewards)

**Interfaces:**
- Consumes: `REWARD_PRESETS` from shared-types; `ShellTab` from `@/components/venue/VenueDashboardShell`; `createClient` from `@/utils/supabase/server`.
- Produces: `saveVenueReward(formData: FormData): Promise<void>`.

- [ ] **Step 1: Write the Server Action**

Create `apps/web/src/actions/reward-actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { REWARD_PRESET_KEYS } from '@happitime/shared-types';

export async function saveVenueReward(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const orgId = String(formData.get('org_id') ?? '');
  const venueId = String(formData.get('venue_id') ?? '');
  const rawPreset = String(formData.get('reward_preset') ?? '');
  const active = formData.get('reward_active') === 'on';
  const returnPath = `/orgs/${orgId}/venues/${venueId}`;

  const reward_preset = REWARD_PRESET_KEYS.includes(rawPreset) ? rawPreset : null;

  // RLS: venue-update policy already restricts to the venue's org members.
  const { error } = await supabase
    .from('venues')
    .update({ reward_preset, reward_active: active } as any)
    .eq('id', venueId);

  if (error) redirect(`${returnPath}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(returnPath);
  redirect(`${returnPath}?success=reward_saved`);
}
```

- [ ] **Step 2: Build the RewardConfig client component**

Create `apps/web/src/app/orgs/[orgId]/venues/[venueId]/RewardConfig.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { REWARD_PRESETS } from '@happitime/shared-types';
import { saveVenueReward } from '@/actions/reward-actions';

export default function RewardConfig({
  orgId, venueId, initialPreset, initialActive,
}: {
  orgId: string; venueId: string;
  initialPreset: string | null; initialActive: boolean;
}) {
  const [preset, setPreset] = useState<string | null>(initialPreset);
  const [active, setActive] = useState<boolean>(initialActive);
  const label = REWARD_PRESETS.find((p) => p.key === preset)?.label ?? null;

  return (
    <form action={saveVenueReward} className="rounded-lg border border-border bg-surface p-6 shadow-sm max-w-xl">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="reward_preset" value={preset ?? ''} />

      <h2 className="text-heading-sm font-semibold text-foreground">Redeemable reward</h2>
      <p className="text-body-sm text-muted mt-0.5 mb-5">Guests earn it after 5 check-ins. You choose what it is.</p>

      <label className="text-body-sm font-medium text-foreground block mb-2">What guests earn</label>
      <div className="flex flex-wrap gap-2 mb-5">
        {REWARD_PRESETS.map((p) => (
          <button
            key={p.key} type="button" onClick={() => setPreset(p.key)}
            className={`text-body-sm font-medium px-3.5 py-2 rounded-full border transition-colors cursor-pointer ${
              preset === p.key
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-border-strong text-muted hover:border-brand hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3.5 mb-5 cursor-pointer">
        <span>
          <span className="block text-body-sm font-semibold text-foreground">Advertise this reward</span>
          <span className="text-caption text-muted">Shown on your listing and in-app while active</span>
        </span>
        <input type="checkbox" name="reward_active" defaultChecked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-9 cursor-pointer" />
      </label>

      <div className="rounded-xl border border-brand-light bg-brand-subtle px-4 py-3 mb-5">
        <span className="text-caption font-semibold uppercase tracking-wider text-brand-dark-alt">Guest preview</span>
        <p className="text-body-sm font-semibold text-foreground mt-1">
          {label && active ? `Check in 5 times — the house buys you ${label.toLowerCase()}.` : 'No reward advertised yet.'}
        </p>
      </div>

      <button type="submit" className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer">
        Save reward
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Wire the tab into the venue page**

Open `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx`. It already builds a `tabs: ShellTab[]` array for `VenueDashboardShell` and fetches the venue row. Add `reward_preset, reward_active` to that venue select, then add a tab object to the `tabs` array:

```tsx
{
  id: 'rewards',
  label: 'Rewards',
  content: (
    <RewardConfig
      orgId={orgId}
      venueId={venue.id}
      initialPreset={(venue as any).reward_preset ?? null}
      initialActive={Boolean((venue as any).reward_active)}
    />
  ),
}
```

Add `import RewardConfig from './RewardConfig';` at the top.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck --workspace web && npm run lint --workspace web`
Expected: clean. (Requires Task 2's regenerated types + Task 1's package export.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/reward-actions.ts "apps/web/src/app/orgs/[orgId]/venues/[venueId]/RewardConfig.tsx" "apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx"
git commit -m "feat(web): owner Rewards tab to set + advertise a venue reward"
```

---

### Task 5: Directory advertising — badge, filter, banner

**Files:**
- Modify: `apps/directory/src/components/VenueCard.tsx` (badge)
- Modify: `apps/directory/src/components/FilterableVenueGrid.tsx` (Rewards filter)
- Modify: the venue detail page under `apps/directory/src/app/**` (banner)

**Interfaces:**
- Consumes: `rewardLabel` — add a mirror in the directory or import from shared-types (confirm the directory can import `@happitime/shared-types`; it shares the web packages). Venue objects must carry `reward_preset` + `reward_active` (add to the directory's venue select in Task 2's read surface).

- [ ] **Step 1: Add the offer-live helper + badge to VenueCard**

Read `apps/directory/src/components/VenueCard.tsx` to match its props/shape. Add, near the top:

```ts
import { rewardLabel } from '@happitime/shared-types';
```

Compute `const offer = venue.reward_active && venue.reward_preset ? rewardLabel(venue.reward_preset) : null;` and, where the card renders its image/overlay, render when `offer`:

```tsx
{offer ? (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-[#6b3f18] shadow">
    5 check-ins = {offer}
  </span>
) : null}
```

- [ ] **Step 2: Add a "Rewards" filter**

In `apps/directory/src/components/FilterableVenueGrid.tsx`, add a filter chip that, when active, keeps only venues where `v.reward_active && v.reward_preset`. Follow the file's existing chip/filter-state pattern (match how other chips toggle and filter the list).

- [ ] **Step 3: Add the venue-page banner**

On the venue detail page, when the venue's offer is live, render above the fold:

```tsx
{venue.reward_active && venue.reward_preset ? (
  <div className="flex items-center gap-3 rounded-2xl border border-brand-light bg-brand-subtle px-4 py-3 mb-6">
    <span className="text-sm font-semibold text-foreground">
      The next round&rsquo;s on the house — check in 5 times, get {rewardLabel(venue.reward_preset)}.
    </span>
  </div>
) : null}
```

- [ ] **Step 4: Typecheck + build the directory (NOT in CI)**

Run: `npm run typecheck --workspace directory && npm run build:directory`
Expected: compiles; the venue routes build.

- [ ] **Step 5: Commit**

```bash
git add apps/directory/src/components/VenueCard.tsx apps/directory/src/components/FilterableVenueGrid.tsx apps/directory/src/app
git commit -m "feat(directory): advertise venue reward (badge, filter, banner)"
```

---

### Task 6: Mobile consumer wiring — show the configured reward

**Files:**
- Modify: `apps/mobile/src/screens/CheckInScreen.tsx`
- Modify: `apps/mobile/src/screens/RoundRedemptionScreen.tsx`

**Interfaces:**
- Consumes: `rewardLabel` from `apps/mobile/src/lib/rewards.mjs`; `reward_preset` from the `verify-checkin` response (Task 3).

- [ ] **Step 1: Thread reward_preset through the check-in result**

In `CheckInScreen.tsx`, the check-in call already returns `{ ok, stamps, ... }`. Capture `reward_preset` from the response and derive the label:

```tsx
import { rewardLabel } from '../lib/rewards.mjs';
// ...
const rewardText = rewardLabel(result.reward_preset) ?? 'your next round';
```

Replace the generic "the house buys your next round" copy in the stamp-card caption with:

```tsx
`Two more and the house buys you ${rewardText}.`
```

(Keep `STAMPS_PER_ROUND = 5` unchanged.)

- [ ] **Step 2: Show the reward on the redemption screen**

In `RoundRedemptionScreen.tsx`, take the reward label (pass it via navigation params from `CheckInScreen`'s `navigation.replace("RoundRedemption", { ... })`, adding `rewardText`), and render "The house owes you {rewardText}. Show your server to redeem." Handle the `weekly_limit_reached` error from Task 3 with a friendly message including `next_eligible_at`.

- [ ] **Step 3: Typecheck + lint mobile**

Run: `npm run typecheck --workspace mobile && npm run lint --workspace mobile`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/CheckInScreen.tsx apps/mobile/src/screens/RoundRedemptionScreen.tsx
git commit -m "feat(mobile): show the venue's configured reward in check-in + redemption"
```

---

### Task 7: Full verification + PR

- [ ] **Step 1: Repo-wide gates**

Run: `npm run typecheck && npm run lint && npm test`
Run: `node --test apps/mobile/src/lib/rewards.test.mjs`
Run: `deno test supabase/functions/verify-checkin/`
Run: `npm run typecheck --workspace directory && npm run build:directory` (directory is not in CI)
Expected: all clean.

- [ ] **Step 2: Manual verify (happy path)**

As an org owner: open a venue's **Rewards** tab, pick "A house draft", toggle Advertise on, Save → success. Confirm the directory card shows "5 check-ins = A house draft", the Rewards filter includes the venue, and the venue banner appears. In the app, the stamp card and redemption screen show "a house draft". Redeem once; attempt a second redemption same week → `weekly_limit_reached` with a friendly next-eligible message.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/redeemable-rounds
gh pr create --fill
```

- [ ] **Step 4: Deploy notes in the PR**

Call out: the migration deploys via `Supabase DB Deploy` on merge (requires the pending migration-history reconciliation to be done first, or db-deploy will still fail); `verify-checkin` must be redeployed (`supabase functions deploy verify-checkin`); the mobile changes are OTA-able. Confirm CI green on Node 20.

---

## Notes on decisions carried from the spec

- **Count stays 5** (D2): no change to `STAMPS_PER_ROUND` (client + `verify-checkin/logic.ts`) or `round_redemptions.checkins_consumed`.
- **Presets only** (D3): the Server Action validates `reward_preset` against `REWARD_PRESET_KEYS` and stores `null` for anything else; no free-text field.
- **Weekly cap enforced in data** (D5): `canRedeemWeekly` in the service-role redeem handler rejects a second claim inside 7 days — not just copy.
- **Public advertising** (D4): badge + filter + banner in the directory (happitime.biz), gated on offer-live so unconfigured venues are unchanged.
- **One reward per venue** (D1): a single `reward_preset` column — no tiers.
