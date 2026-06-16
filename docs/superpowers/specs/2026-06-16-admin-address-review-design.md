# Admin Address-Review Surface — Design

**Date:** 2026-06-16
**Status:** Approved (design)
**Depends on:** `validate-venue-places` edge function (live in prod), `venues.needs_address_review`, `venue_validation_log` (PRs #91/#92/#93).

## Goal

Give admins a review queue for venues the hourly `validate-venue-places` cron has flagged with `needs_address_review = true`. The reviewer sees the stored address vs Google's canonical address (and the match score), then resolves each flag by either **accepting Google's address** (our stored address was wrong) or **dismissing / keeping ours** (Google's `places_id` points elsewhere, our address is right). Detection already exists; this is the human-in-the-loop resolution surface.

## Background: the re-flag churn problem

`needs_address_review` is a boolean the cron only ever **sets** (`true` on mismatch) and never reads or clears. Without a resolution state, an admin who clears the flag would see the venue re-flagged on the next hourly run if the address still mismatches. The design adds a sticky resolution timestamp so the cron respects a human decision.

## Architecture

Six units, each independently understandable:

### 1. Migration — resolution state on `venues`

```sql
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS address_review_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS address_review_resolved_by uuid REFERENCES auth.users(id);
```

`address_review_resolved_at IS NULL` = unreviewed. Set on **Dismiss** only (see actions).

### 2. Read model — `v_address_review_queue` view

Security-invoker view (per repo convention `phase2a_security_invoker_views`) joining flagged venues to their **latest** validation-log row:

```sql
CREATE OR REPLACE VIEW public.v_address_review_queue
WITH (security_invoker = true) AS
SELECT
  v.id            AS venue_id,
  v.name          AS venue_name,
  v.slug          AS venue_slug,
  v.address, v.city, v.state, v.zip,
  v.places_id,
  v.places_validated_at,
  log.stored_address,
  log.google_address,
  log.match_score,
  log.checked_at
FROM public.venues v
JOIN LATERAL (
  SELECT stored_address, google_address, match_score, checked_at
  FROM public.venue_validation_log l
  WHERE l.venue_id = v.id
  ORDER BY l.checked_at DESC
  LIMIT 1
) log ON true
WHERE v.needs_address_review = true
ORDER BY log.match_score ASC NULLS FIRST, log.checked_at DESC;
```

Queried by the admin **service-role** client, so RLS is bypassed; `security_invoker` keeps it consistent with the repo's view convention and avoids a definer-owned escalation surface.

### 3. Edge-function change — anti-churn (modify `validate-venue-places/index.ts`)

Today the per-venue write is `...(mismatch ? { needs_address_review: true } : {})` — it never clears the flag. Change to:

- Add `address_review_resolved_at` to the venue `SELECT`.
- On each processed venue:
  - if `address_review_resolved_at` **is null** → write `needs_address_review = mismatch` (sets `true` on mismatch, **clears** `false` on match — fixes a latent bug where corrected addresses stayed flagged).
  - if `address_review_resolved_at` **is not null** → do **not** write `needs_address_review` at all (the human decision stands).
- `places_validated_at = now` is still written for every processed venue (resolved venues stay in the rotation so logs keep accruing; bounded by `VALIDATE_BATCH_LIMIT`).

Redeploy via Supabase CLI; verify a manual `invoke_validate_venues()` returns 200 in `net._http_response` and that resolved venues are not re-flagged.

### 4. Pure parser — `formattedAddress → {address, city, state, zip}`

New pure module (e.g. `apps/web/src/utils/parse-formatted-address.ts`), TDD'd like `_shared/address-match.ts`:

- Input: a US `formattedAddress` string, e.g. `"1580 Main St, Kansas City, MO 64108, USA"`.
- Split on commas → `[street, city, "STATE ZIP", "USA"?]`; drop trailing `USA`/`US`.
- `address` = first segment; `city` = second segment; `state` + `zip` parsed from the `"MO 64108"` segment via regex (`/\b([A-Z]{2})\b\s+(\d{5})(?:-\d{4})?/`).
- Return best-effort fields; if the shape is unexpected, return whatever parsed and leave the rest blank.
- Tests cover: standard address, suite/unit in street, missing country, ZIP+4, malformed → graceful partial.

The parse result only **pre-fills** an editable form — a human confirms — so imperfect parses are non-fatal.

### 5. Server actions — `actions/admin-address-review-actions.ts`

Both `'use server'`, guarded by `assertAdmin()`, using `getAdminClient()` and `revalidatePath('/admin/address-review')` + `revalidatePath('/admin')`.

- `acceptGoogleAddress(venueId, fields: {address, city, state, zip})`
  - update `venues` set the four address fields, `needs_address_review = false`. Leave `address_review_resolved_at` **NULL** (venue stays in rotation; it now matches Google so it won't re-flag).
  - validate `venueId` is currently flagged before writing.
- `dismissAddressReview(venueId)`
  - update `venues` set `needs_address_review = false`, `address_review_resolved_at = now()`, `address_review_resolved_by = <current admin user id>`.

### 6. UI — page + actions component + nav card

- `apps/web/src/app/admin/address-review/page.tsx` — server component (`createServiceClient` with `getServiceRoleKeyError` fallback, mirroring `admin/suggestions`). Selects from `v_address_review_queue` (limit ~200). Renders header/breadcrumb + count badge + empty state + table.
- Table columns: Venue (name + a slug-based link to the venue; exact route — public detail vs. admin edit — resolved during implementation by matching the existing pattern used elsewhere in `/admin`), **Stored address**, **Google address**, **Score** (badge; red < 0.5, amber 0.5–0.7), Checked, Actions.
- `apps/web/src/app/admin/address-review/AddressReviewActions.tsx` — `'use client'`, `useTransition`. Two buttons:
  - **Accept Google's** → expands an inline editable form pre-filled by the parser (address/city/state/zip inputs); Confirm calls `acceptGoogleAddress`.
  - **Dismiss / keep ours** → calls `dismissAddressReview` (optionally behind a small confirm).
  - Error + pending states mirror `StagingActions.tsx`.
- `admin/page.tsx`: add `{ count: addressReviewCount }` to the `Promise.all` stats block (`venues … .eq('needs_address_review', true)`) and a `stats[]` card `{ label: 'Address Review', value: addressReviewCount ?? 0, icon: 'AR', href: '/admin/address-review' }`.

## Data flow

1. Hourly cron → `validate-venue-places` → writes `venue_validation_log` rows + sets/clears `needs_address_review` (respecting `address_review_resolved_at`).
2. Admin opens `/admin/address-review` → `v_address_review_queue` lists flagged venues + latest log.
3. Admin clicks **Accept Google's** → confirms pre-filled fields → `acceptGoogleAddress` updates venue + clears flag → row disappears (revalidate). Next cron run scores it a match.
4. Admin clicks **Dismiss** → `dismissAddressReview` clears flag + stamps `resolved_at` → row disappears; cron will not re-flag.

## Error handling

- Page: render-time errors surfaced in an error banner (mirrors `admin/suggestions`).
- Actions: throw on not-found / not-flagged / DB error; client catches and shows inline message (mirrors `StagingActions`).
- Edge function: unchanged transient/fatal handling; resolution logic is a pure branch on a selected column.

## Testing

- **Unit (TDD):** `parse-formatted-address` pure module — full case table.
- **Edge function:** verify empirically in prod — manual `invoke_validate_venues()`, confirm `net._http_response` 200, confirm a dismissed venue is not re-flagged and a matching venue is auto-cleared.
- **Admin page/actions:** follow repo convention (no unit tests for admin server components); verify via `next build` (CI `node` job) and manual click-through of Accept + Dismiss against prod data.

## Out of scope (future)

- "Re-open" a resolved venue from the UI.
- A separate "wrong places_id" action (clear/refresh `places_id`); Dismiss covers it for now.
- Re-validating a dismissed venue automatically if its stored address is later edited.
- Excluding resolved venues from the cron batch to save Places API calls (kept in rotation for v1).
