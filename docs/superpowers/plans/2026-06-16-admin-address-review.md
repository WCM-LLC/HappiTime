# Admin Address-Review Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an `/admin/address-review` queue where admins resolve venues flagged `needs_address_review` by the hourly `validate-venue-places` cron — accept Google's address or dismiss/keep ours — with an anti-churn resolution state so the cron respects the decision.

**Architecture:** A migration adds resolution columns + a `v_address_review_queue` read view. The edge function is taught to respect that state (and to auto-clear stale flags). A pure `.mjs` parser turns Google's `formattedAddress` into editable fields. Two service-role server actions perform the writes. A server-component page + a client actions component render the queue, plus a nav card.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + service-role client), Deno edge function (TypeScript), `node --test` (`test/*.test.mjs`) for unit/wiring tests.

**Spec:** `docs/superpowers/specs/2026-06-16-admin-address-review-design.md`

---

## File Structure

- **Create** `supabase/migrations/20260616120000_add_address_review_resolution.sql` — `venues.address_review_resolved_at` + `address_review_resolved_by`; `v_address_review_queue` view.
- **Modify** `supabase/functions/validate-venue-places/index.ts` — select `address_review_resolved_at`; respect it + auto-clear on match.
- **Create** `apps/web/src/utils/parse-formatted-address.mjs` — pure parser (`formattedAddress` → `{address,city,state,zip}`).
- **Create** `apps/web/src/actions/admin-address-review-actions.ts` — `acceptGoogleAddress`, `dismissAddressReview`.
- **Create** `apps/web/src/app/admin/address-review/page.tsx` — server-component queue.
- **Create** `apps/web/src/app/admin/address-review/AddressReviewActions.tsx` — client actions component.
- **Modify** `apps/web/src/app/admin/page.tsx` — count query + nav card.
- **Create** `test/parse-formatted-address.test.mjs` — real unit tests for the parser.
- **Create** `test/admin-address-review.test.mjs` — source-assertion wiring guards.

> **Conventions confirmed in this repo:** admin pages live under `apps/web/src/app/admin/` and are gated by `admin/layout.tsx` (`isAdmin()`); read-only queues use `createServiceClient()` with a `getServiceRoleKeyError()` fallback (`admin/suggestions/page.tsx`); server actions use `assertAdmin()` + `getAdminClient()` + `revalidatePath()` (`actions/admin-staging-actions.ts`); pure parsers are plain ESM `.mjs` imported directly by `node --test` (`apps/mobile/src/lib/parseVenueLink.mjs` ↔ `test/parse-venue-link.test.mjs`); wiring is guarded by `readFileSync` + regex source assertions (`test/admin-insider-attribution.test.mjs`).

---

## Task 1: Migration — resolution columns + read view

**Files:**
- Create: `supabase/migrations/20260616120000_add_address_review_resolution.sql`
- Test: `test/admin-address-review.test.mjs`

- [ ] **Step 1: Write the failing wiring test**

Create `test/admin-address-review.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mig = readFileSync(
  new URL("../supabase/migrations/20260616120000_add_address_review_resolution.sql", import.meta.url),
  "utf8"
);

test("migration adds resolution columns to venues", () => {
  assert.match(mig, /add column if not exists address_review_resolved_at timestamptz/i);
  assert.match(mig, /add column if not exists address_review_resolved_by uuid/i);
});

test("migration creates the security-invoker review queue view", () => {
  assert.match(mig, /create or replace view public\.v_address_review_queue/i);
  assert.match(mig, /security_invoker\s*=\s*true/i);
  assert.match(mig, /needs_address_review\s*=\s*true/i);
  assert.match(mig, /venue_validation_log/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/admin-address-review.test.mjs`
Expected: FAIL — cannot read the migration file (ENOENT) / assertions unmet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260616120000_add_address_review_resolution.sql`:

```sql
-- Resolution state for the address-review queue. Set when an admin dismisses a
-- flag (keeps our address); makes the cron stop re-flagging that venue.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS address_review_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS address_review_resolved_by uuid REFERENCES auth.users(id);

-- Read model for /admin/address-review: flagged venues + their latest
-- validation-log row. security_invoker per repo convention
-- (20260429150000_phase2a_security_invoker_views); the admin page queries it
-- with the service-role client.
CREATE OR REPLACE VIEW public.v_address_review_queue
WITH (security_invoker = true) AS
SELECT
  v.id        AS venue_id,
  v.org_id    AS org_id,
  v.name      AS venue_name,
  v.slug      AS venue_slug,
  v.address, v.city, v.state, v.zip,
  v.places_id,
  v.places_validated_at,
  log.stored_address,
  log.google_address,
  log.match_score,
  log.checked_at
FROM public.venues v
JOIN LATERAL (
  SELECT l.stored_address, l.google_address, l.match_score, l.checked_at
  FROM public.venue_validation_log l
  WHERE l.venue_id = v.id
  ORDER BY l.checked_at DESC
  LIMIT 1
) log ON true
WHERE v.needs_address_review = true
ORDER BY log.match_score ASC NULLS FIRST, log.checked_at DESC;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/admin-address-review.test.mjs`
Expected: PASS (2 tests in this file so far).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260616120000_add_address_review_resolution.sql test/admin-address-review.test.mjs
git commit -m "feat(db): address-review resolution columns + v_address_review_queue view"
```

---

## Task 2: Pure parser — `formattedAddress` → fields (real TDD)

**Files:**
- Create: `apps/web/src/utils/parse-formatted-address.mjs`
- Test: `test/parse-formatted-address.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `test/parse-formatted-address.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseFormattedAddress } from "../apps/web/src/utils/parse-formatted-address.mjs";

test("parses a standard US formatted address", () => {
  assert.deepEqual(parseFormattedAddress("1580 Main St, Kansas City, MO 64108, USA"), {
    address: "1580 Main St",
    city: "Kansas City",
    state: "MO",
    zip: "64108",
  });
});

test("handles a missing country segment", () => {
  assert.deepEqual(parseFormattedAddress("928 Wyandotte St, Kansas City, MO 64105"), {
    address: "928 Wyandotte St",
    city: "Kansas City",
    state: "MO",
    zip: "64105",
  });
});

test("keeps a suite in the street segment", () => {
  assert.deepEqual(parseFormattedAddress("51 E 14th St Ste 200, Kansas City, MO 64106, USA"), {
    address: "51 E 14th St Ste 200",
    city: "Kansas City",
    state: "MO",
    zip: "64106",
  });
});

test("parses ZIP+4", () => {
  assert.deepEqual(parseFormattedAddress("1601 Oak St, Kansas City, MO 64108-1234, USA"), {
    address: "1601 Oak St",
    city: "Kansas City",
    state: "MO",
    zip: "64108-1234",
  });
});

test("returns graceful partial on an unexpected shape", () => {
  assert.deepEqual(parseFormattedAddress("Some Place"), {
    address: "Some Place",
    city: "",
    state: "",
    zip: "",
  });
});

test("empty / nullish input yields empty fields", () => {
  assert.deepEqual(parseFormattedAddress(""), { address: "", city: "", state: "", zip: "" });
  assert.deepEqual(parseFormattedAddress(null), { address: "", city: "", state: "", zip: "" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/parse-formatted-address.test.mjs`
Expected: FAIL — `Cannot find module .../parse-formatted-address.mjs`.

- [ ] **Step 3: Write the parser**

Create `apps/web/src/utils/parse-formatted-address.mjs`:

```js
// Pure parser for Google Places v1 `formattedAddress` strings (US-shaped):
// "STREET[, suite], CITY, STATE ZIP[, USA]". No I/O.
// Best-effort: returns whatever it can; a human confirms the result before save.

const COUNTRY = new Set(["usa", "us", "united states", "united states of america"]);
const STATE_ZIP = /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;

/**
 * @param {string|null|undefined} formatted
 * @returns {{address: string, city: string, state: string, zip: string}}
 */
export function parseFormattedAddress(formatted) {
  const empty = { address: "", city: "", state: "", zip: "" };
  if (!formatted || typeof formatted !== "string") return empty;

  let parts = formatted
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Drop a trailing country segment.
  if (parts.length > 0 && COUNTRY.has(parts[parts.length - 1].toLowerCase())) {
    parts = parts.slice(0, -1);
  }

  if (parts.length === 0) return empty;

  // The last segment should be "STATE ZIP".
  const tail = parts[parts.length - 1];
  const m = tail.match(STATE_ZIP);

  if (!m) {
    // Unexpected shape — put everything we have in `address`.
    return { ...empty, address: parts.join(", ") };
  }

  const state = m[1].toUpperCase();
  const zip = m[2];
  const city = parts.length >= 2 ? parts[parts.length - 2] : "";
  const address = parts.slice(0, Math.max(0, parts.length - 2)).join(", ");

  return { address, city, state, zip };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/parse-formatted-address.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/parse-formatted-address.mjs test/parse-formatted-address.test.mjs
git commit -m "feat(admin): pure parser for Google formattedAddress -> fields"
```

---

## Task 3: Edge-function anti-churn change

**Files:**
- Modify: `supabase/functions/validate-venue-places/index.ts`
- Test: `test/admin-address-review.test.mjs` (append)

- [ ] **Step 1: Append failing wiring tests**

Append to `test/admin-address-review.test.mjs`:

```js
const fn = readFileSync(
  new URL("../supabase/functions/validate-venue-places/index.ts", import.meta.url),
  "utf8"
);

test("edge fn selects the resolution column", () => {
  assert.match(fn, /address_review_resolved_at/);
});

test("edge fn only writes the flag when unresolved, and clears on match", () => {
  // unresolved venues get needs_address_review = mismatch (true OR false)
  assert.match(fn, /needs_address_review:\s*mismatch/);
  // resolved venues are left untouched (guard on resolved_at)
  assert.match(fn, /resolved_at|address_review_resolved_at/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/admin-address-review.test.mjs`
Expected: FAIL — `needs_address_review: mismatch` not present (current code is `needs_address_review: true`).

- [ ] **Step 3: Modify the SELECT**

In `supabase/functions/validate-venue-places/index.ts`, change the venue select (currently `.select("id,address,city,state,zip,places_id")`) to include the resolution column:

```ts
  const { data: venues, error: selErr } = await supabase
    .from("venues")
    .select("id,address,city,state,zip,places_id,address_review_resolved_at")
    .not("places_id", "is", null)
    .order("places_validated_at", { ascending: true, nullsFirst: true })
    .limit(batchLimit);
```

- [ ] **Step 4: Modify the per-venue update**

Replace the current update block:

```ts
    await supabase
      .from("venues")
      .update({
        places_validated_at: now,
        ...(mismatch ? { needs_address_review: true } : {}),
      })
      .eq("id", v.id);
```

with:

```ts
    // Resolved venues (a human accepted/dismissed): the cron must not re-flag.
    // Unresolved venues: keep the flag authoritative — set on mismatch, clear on
    // match (fixes stale flags left by the old set-only behavior).
    const resolved = (v as { address_review_resolved_at?: string | null })
      .address_review_resolved_at != null;
    await supabase
      .from("venues")
      .update({
        places_validated_at: now,
        ...(resolved ? {} : { needs_address_review: mismatch }),
      })
      .eq("id", v.id);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/admin-address-review.test.mjs`
Expected: PASS (all wiring tests in this file).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/validate-venue-places/index.ts test/admin-address-review.test.mjs
git commit -m "feat(validate): respect address_review_resolved_at; clear stale flags on match"
```

> Prod redeploy of this function happens in Task 7 (needs the migration applied first).

---

## Task 4: Server actions

**Files:**
- Create: `apps/web/src/actions/admin-address-review-actions.ts`
- Test: `test/admin-address-review.test.mjs` (append)

- [ ] **Step 1: Append failing wiring tests**

Append to `test/admin-address-review.test.mjs`:

```js
const actions = readFileSync(
  new URL("../apps/web/src/actions/admin-address-review-actions.ts", import.meta.url),
  "utf8"
);

test("actions are admin-guarded server actions", () => {
  assert.match(actions, /^'use server'/m);
  assert.match(actions, /assertAdmin\(\)/);
  assert.match(actions, /getAdminClient\(\)/);
});

test("acceptGoogleAddress writes fields and clears the flag", () => {
  assert.match(actions, /export async function acceptGoogleAddress/);
  assert.match(actions, /needs_address_review:\s*false/);
});

test("dismissAddressReview stamps resolution state", () => {
  assert.match(actions, /export async function dismissAddressReview/);
  assert.match(actions, /address_review_resolved_at/);
  assert.match(actions, /address_review_resolved_by/);
});

test("actions revalidate the queue", () => {
  assert.match(actions, /revalidatePath\(['"]\/admin\/address-review['"]\)/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/admin-address-review.test.mjs`
Expected: FAIL — cannot read the actions file.

- [ ] **Step 3: Write the actions**

Create `apps/web/src/actions/admin-address-review-actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';

export type AddressFields = {
  address: string;
  city: string;
  state: string;
  zip: string;
};

function revalidate() {
  revalidatePath('/admin/address-review');
  revalidatePath('/admin');
}

/**
 * Accept Google's address: overwrite the venue's address fields and clear the
 * flag. Leaves address_review_resolved_at NULL so the venue stays in the
 * validation rotation (it now matches Google, so it won't re-flag).
 */
export async function acceptGoogleAddress(venueId: string, fields: AddressFields) {
  await assertAdmin();
  if (!venueId) throw new Error('Missing venue id');
  const address = fields.address?.trim() ?? '';
  const city = fields.city?.trim() ?? '';
  const state = fields.state?.trim() ?? '';
  const zip = fields.zip?.trim() ?? '';
  if (!address || !city || !state || !zip) {
    throw new Error('Address, city, state and zip are all required');
  }

  const supabase = getAdminClient();

  const { data: venue, error: fetchErr } = await supabase
    .from('venues')
    .select('id, needs_address_review')
    .eq('id', venueId)
    .single();
  if (fetchErr || !venue) throw new Error('Venue not found');
  if (!venue.needs_address_review) throw new Error('Venue is not currently flagged for review');

  const { error: updErr } = await supabase
    .from('venues')
    .update({ address, city, state, zip, needs_address_review: false })
    .eq('id', venueId);
  if (updErr) throw new Error(updErr.message);

  revalidate();
  return { ok: true };
}

/**
 * Dismiss the flag (our address is right; Google's place_id points elsewhere).
 * Stamps resolution state so the hourly cron will not re-flag this venue.
 */
export async function dismissAddressReview(venueId: string) {
  await assertAdmin();
  if (!venueId) throw new Error('Missing venue id');

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const resolvedBy = auth.user?.id ?? null;

  const supabase = getAdminClient();

  const { data: venue, error: fetchErr } = await supabase
    .from('venues')
    .select('id, needs_address_review')
    .eq('id', venueId)
    .single();
  if (fetchErr || !venue) throw new Error('Venue not found');
  if (!venue.needs_address_review) throw new Error('Venue is not currently flagged for review');

  const { error: updErr } = await supabase
    .from('venues')
    .update({
      needs_address_review: false,
      address_review_resolved_at: new Date().toISOString(),
      address_review_resolved_by: resolvedBy,
    })
    .eq('id', venueId);
  if (updErr) throw new Error(updErr.message);

  revalidate();
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/admin-address-review.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/admin-address-review-actions.ts test/admin-address-review.test.mjs
git commit -m "feat(admin): accept/dismiss server actions for address review"
```

---

## Task 5: Actions client component

**Files:**
- Create: `apps/web/src/app/admin/address-review/AddressReviewActions.tsx`
- Test: `test/admin-address-review.test.mjs` (append)

- [ ] **Step 1: Append failing wiring tests**

Append to `test/admin-address-review.test.mjs`:

```js
const actionsUi = readFileSync(
  new URL("../apps/web/src/app/admin/address-review/AddressReviewActions.tsx", import.meta.url),
  "utf8"
);

test("actions component is a client component using the server actions + parser", () => {
  assert.match(actionsUi, /^'use client'/m);
  assert.match(actionsUi, /acceptGoogleAddress/);
  assert.match(actionsUi, /dismissAddressReview/);
  assert.match(actionsUi, /parseFormattedAddress/);
  assert.match(actionsUi, /useTransition/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/admin-address-review.test.mjs`
Expected: FAIL — cannot read the component file.

- [ ] **Step 3: Write the component**

Create `apps/web/src/app/admin/address-review/AddressReviewActions.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { acceptGoogleAddress, dismissAddressReview } from '@/actions/admin-address-review-actions';
import { parseFormattedAddress } from '@/utils/parse-formatted-address.mjs';

export function AddressReviewActions({
  venueId,
  googleAddress,
}: {
  venueId: string;
  googleAddress: string | null;
}) {
  const [mode, setMode] = useState<'idle' | 'accept' | 'dismiss'>('idle');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  const parsed = parseFormattedAddress(googleAddress);
  const [address, setAddress] = useState(parsed.address);
  const [city, setCity] = useState(parsed.city);
  const [stateField, setStateField] = useState(parsed.state);
  const [zip, setZip] = useState(parsed.zip);

  function runAccept() {
    setErr('');
    startTransition(async () => {
      try {
        await acceptGoogleAddress(venueId, { address, city, state: stateField, zip });
        // Row disappears on revalidate; no local state needed.
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Accept failed');
      }
    });
  }

  function runDismiss() {
    setErr('');
    startTransition(async () => {
      try {
        await dismissAddressReview(venueId);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Dismiss failed');
      }
    });
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-col gap-1.5 min-w-[180px]">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('accept')}
            disabled={!googleAddress}
            className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            Accept Google&apos;s
          </button>
          <button
            type="button"
            onClick={() => setMode('dismiss')}
            className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Keep ours
          </button>
        </div>
        {err && <p className="text-caption text-error">{err}</p>}
      </div>
    );
  }

  if (mode === 'accept') {
    return (
      <div className="flex flex-col gap-1.5 min-w-[240px]">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address"
          className="h-8 rounded border border-border bg-background text-body-sm px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
        />
        <div className="flex gap-1.5">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="h-8 w-1/2 rounded border border-border bg-background text-body-sm px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
          <input
            value={stateField}
            onChange={(e) => setStateField(e.target.value)}
            placeholder="ST"
            maxLength={2}
            className="h-8 w-14 rounded border border-border bg-background text-body-sm px-2 uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="ZIP"
            className="h-8 w-24 rounded border border-border bg-background text-body-sm px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
        </div>
        {err && <p className="text-caption text-error">{err}</p>}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={runAccept}
            disabled={isPending}
            className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isPending ? 'Saving…' : 'Save address'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('idle'); setErr(''); }}
            disabled={isPending}
            className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // mode === 'dismiss'
  return (
    <div className="flex flex-col gap-1.5 min-w-[200px]">
      <p className="text-caption text-muted">
        Keep our address and stop re-flagging this venue?
      </p>
      {err && <p className="text-caption text-error">{err}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={runDismiss}
          disabled={isPending}
          className="h-7 px-3 rounded bg-error text-white text-caption font-medium hover:opacity-80 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isPending ? 'Dismissing…' : 'Confirm dismiss'}
        </button>
        <button
          type="button"
          onClick={() => { setMode('idle'); setErr(''); }}
          disabled={isPending}
          className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

> Note: importing `@/utils/parse-formatted-address.mjs` with the explicit `.mjs` extension mirrors the existing `parseVenueLink.mjs` pattern; the Next bundler resolves it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/admin-address-review.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/address-review/AddressReviewActions.tsx test/admin-address-review.test.mjs
git commit -m "feat(admin): address-review actions client component"
```

---

## Task 6: Queue page

**Files:**
- Create: `apps/web/src/app/admin/address-review/page.tsx`
- Test: `test/admin-address-review.test.mjs` (append)

- [ ] **Step 1: Append failing wiring tests**

Append to `test/admin-address-review.test.mjs`:

```js
const page = readFileSync(
  new URL("../apps/web/src/app/admin/address-review/page.tsx", import.meta.url),
  "utf8"
);

test("page reads the review queue view and renders actions", () => {
  assert.match(page, /v_address_review_queue/);
  assert.match(page, /AddressReviewActions/);
  assert.match(page, /stored_address/);
  assert.match(page, /google_address/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/admin-address-review.test.mjs`
Expected: FAIL — cannot read the page file.

- [ ] **Step 3: Write the page**

Create `apps/web/src/app/admin/address-review/page.tsx`:

```tsx
import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { AddressReviewActions } from './AddressReviewActions';

type QueueRow = {
  venue_id: string;
  org_id: string | null;
  venue_name: string;
  venue_slug: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  places_id: string | null;
  stored_address: string | null;
  google_address: string | null;
  match_score: number | null;
  checked_at: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function scoreBadge(score: number | null) {
  const s = score ?? 0;
  const cls = s < 0.5
    ? 'bg-error-light text-error'
    : 'bg-brand-subtle text-brand-dark-alt';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${cls}`}>
      {score == null ? 'n/a' : score.toFixed(2)}
    </span>
  );
}

export default async function AddressReviewPage() {
  const keyError = getServiceRoleKeyError();
  const supabase = keyError ? await createClient() : createServiceClient();

  const { data: raw, error } = await supabase
    .from('v_address_review_queue')
    .select('*')
    .limit(200);

  const rows: QueueRow[] = (raw ?? []) as QueueRow[];

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">Dashboard</Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">Admin Console</Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Address Review</h1>
            <p className="text-body-sm text-muted mt-1">
              Venues whose stored address drifts from Google. Accept Google&apos;s address, or keep ours.
            </p>
          </div>
          <Link href="/admin">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Admin Console
            </span>
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Failed to load review queue</p>
            <p className="text-body-sm text-error/80 mt-0.5">{error.message}</p>
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <span className="text-heading-sm font-semibold text-foreground">
            {rows.length} venue{rows.length !== 1 ? 's' : ''} flagged
          </span>
        </div>

        {rows.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
            <p className="text-body-md font-semibold text-foreground mb-1">Nothing to review</p>
            <p className="text-body-sm text-muted">
              When the hourly validator finds an address mismatch it will appear here.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Venue</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Stored address</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Google address</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Checked</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.venue_id} className={`border-b border-border last:border-0 align-top ${i % 2 === 1 ? 'bg-background/50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {r.org_id ? (
                        <Link href={`/orgs/${r.org_id}/venues/${r.venue_id}?from=admin`} className="text-brand hover:underline">
                          {r.venue_name}
                        </Link>
                      ) : (
                        r.venue_name
                      )}
                      {r.places_id && (
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${r.places_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-caption text-muted-light hover:text-muted mt-0.5"
                        >
                          View on Google ↗
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-xs">
                      {r.stored_address ?? <span className="text-muted-light">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-xs">
                      {r.google_address ?? <span className="text-muted-light">— (place not found)</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{scoreBadge(r.match_score)}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(r.checked_at)}</td>
                    <td className="px-4 py-3">
                      <AddressReviewActions venueId={r.venue_id} googleAddress={r.google_address} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/admin-address-review.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/address-review/page.tsx test/admin-address-review.test.mjs
git commit -m "feat(admin): address-review queue page"
```

---

## Task 7: Admin nav card + count

**Files:**
- Modify: `apps/web/src/app/admin/page.tsx`
- Test: `test/admin-address-review.test.mjs` (append)

- [ ] **Step 1: Append failing wiring tests**

Append to `test/admin-address-review.test.mjs`:

```js
const adminIndex = readFileSync(
  new URL("../apps/web/src/app/admin/page.tsx", import.meta.url),
  "utf8"
);

test("admin index counts flagged venues and links the card", () => {
  assert.match(adminIndex, /needs_address_review.*true|eq\('needs_address_review', true\)/);
  assert.match(adminIndex, /\/admin\/address-review/);
  assert.match(adminIndex, /Address Review/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/admin-address-review.test.mjs`
Expected: FAIL — no `/admin/address-review` reference in the admin index yet.

- [ ] **Step 3: Add the count query**

In `apps/web/src/app/admin/page.tsx`, inside the destructured `Promise.all([...])` stats block (the one yielding `stagingCount`), add a new entry. Add to the destructuring list (after `{ count: stagingCount }`):

```ts
    { count: addressReviewCount },
```

and the matching query at the end of the `Promise.all` array (after the `staging_venues` line):

```ts
    supabase.from('venues').select('id', { count: 'exact', head: true }).eq('needs_address_review', true),
```

- [ ] **Step 4: Add the nav card**

In the `stats` array, add after the `Staging` entry:

```ts
    { label: 'Address Review', value: addressReviewCount ?? 0, icon: 'AR', href: '/admin/address-review' },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/admin-address-review.test.mjs`
Expected: PASS (all files' wiring tests).

- [ ] **Step 6: Full unit suite + web build**

Run: `npm test`
Expected: PASS (existing suite + the two new test files).

Run: `npm run build:web`
Expected: build succeeds (type-checks the new page, actions, and component).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/page.tsx test/admin-address-review.test.mjs
git commit -m "feat(admin): address-review nav card + flagged-venue count"
```

---

## Task 8: Deploy & verify in prod (lead-run, with user go-ahead)

> This task mutates prod (migration apply + edge-fn redeploy). Run it via the MCP/CLI tools after the PR is green and the user approves — mirroring the validate-venue-places release. Not a subagent step.

- [ ] **Step 1: Open the PR and confirm CI green**

```bash
git push -u origin feat/admin-address-review-surface
gh pr create --base master --title "feat(admin): venue address-review surface" --body "<summary>"
gh pr checks <PR#>   # node, supabase-migrations, build all green
```

- [ ] **Step 2: Apply the migration to prod**

Apply `20260616120000_add_address_review_resolution.sql` to prod (project `ujflcrjsiyhofnomurco`) via `apply_migration`. Verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='venues'
  AND column_name IN ('address_review_resolved_at','address_review_resolved_by');
-- expect 2 rows
SELECT count(*) FROM public.v_address_review_queue;  -- expect current flagged count (e.g. 3)
```

- [ ] **Step 3: Redeploy the edge function (now that the column exists)**

```bash
supabase functions deploy validate-venue-places --project-ref ujflcrjsiyhofnomurco
```

- [ ] **Step 4: Verify anti-churn in prod**

```sql
SELECT public.invoke_validate_venues();           -- trigger one run
-- then, after a few seconds:
SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
-- expect 200 {"processed":N,...}
```

Dismiss one venue via the UI (or `UPDATE venues SET needs_address_review=false, address_review_resolved_at=now() WHERE id=...`), invoke again, and confirm that venue is **not** re-flagged (its `needs_address_review` stays false). Confirm a venue whose address was Accepted scores a match and stays cleared.

- [ ] **Step 5: Manual click-through**

On the deployed `happitime-console` preview/prod: open `/admin/address-review`, Accept one venue (edit the pre-filled fields, save → row disappears), Dismiss another (→ row disappears), and confirm the admin index card count drops.

- [ ] **Step 6: Merge**

```bash
gh pr merge <PR#> --squash --delete-branch
```

---

## Self-Review

- **Spec coverage:** §1 migration → Task 1; §2 view → Task 1; §3 edge fn anti-churn → Task 3; §4 parser → Task 2; §5 actions → Task 4; §6 page/component/nav → Tasks 5–7; deploy/verify → Task 8. All sections covered.
- **Type consistency:** `acceptGoogleAddress(venueId, fields)` / `dismissAddressReview(venueId)` signatures match between Task 4 (definition), Task 5 (callsite), and the wiring tests. `AddressFields` = `{address,city,state,zip}` matches the parser's return shape (Task 2) and the component state. `parseFormattedAddress` name matches across Task 2 and Task 5. View column names (`venue_id,org_id,venue_name,venue_slug,stored_address,google_address,match_score,checked_at,places_id`) match the page's `QueueRow` type.
- **Placeholder scan:** no TBD/TODO; all code blocks are complete. (The only deferred item is the PR body `<summary>` and `<PR#>` in Task 8, which are runtime values for the lead, not code.)
