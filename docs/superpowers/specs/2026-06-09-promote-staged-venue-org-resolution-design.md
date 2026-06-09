# Promote Staged Venue — Org Match-or-Create

**Status:** Approved design · 2026-06-09
**Area:** Admin Staged Venues console (`apps/web/src/app/admin/staging`)

## Problem

Promoting a staged venue requires choosing an **existing** organization. `adminPromoteStagingVenue(stagingId, orgId)` takes a required `orgId` and `PromoteForm` errors with "Select an organization" when none is chosen. Consequences:

- A venue whose org doesn't exist yet **cannot be promoted** — and the very first venue can't be promoted at all (no org to select).
- The only path to attach a venue to an org is the manual dropdown; there is no create path.

## Goal

On Promote, resolve the org automatically: **attach to a matching existing org if one exists, otherwise create a new org** — reusing the existing org-dedup infrastructure so we don't create duplicates. Preserve the ability to attach to a specific existing org explicitly.

## Current state (verified)

- Action: `apps/web/src/actions/admin-staging-actions.ts` → `adminPromoteStagingVenue(stagingId, orgId)`. Already dedupes the **venue** by `places_id`, generates a unique venue slug, inserts the venue with `org_id`, marks the staging row `merged`. All via the service-role admin client behind `assertAdmin()`.
- UI: `apps/web/src/app/admin/staging/_components/StagingActions.tsx` → `PromoteForm` renders a `<select>` of existing orgs and requires a selection.
- Org dedup infra (migration `20260502140757_dedupe_organizations_and_prevent_duplicate_orgs.sql`): `normalize_organization_name(text)` (canonicalizes "O'Dowd's" ≈ "Odowds"), `organization_slugify(text)`, and a partial unique index on `organizations.slug`.
- Schema: `organizations` requires only `name` + `slug` (no owner column) → an **ownerless** org is valid, claimed by the venue owner later. `org_members` requires a `user_id` → no membership row is created on auto-create.

## Design

### Server action: `adminPromoteStagingVenue`

`orgId` becomes **optional**: `adminPromoteStagingVenue(stagingId: string, orgId?: string)`.

- **Override path** — if `orgId` is provided, use it as today (explicit "attach to existing org").
- **Auto path** (no `orgId`) — resolve via a new helper `resolveOrgForVenue(supabase, venueName)`:
  1. **Match:** select the oldest `organizations` row where `normalize_organization_name(name) = normalize_organization_name(<venueName>)`. If found, return its id.
  2. **Create:** otherwise generate a unique slug from `organization_slugify(<venueName>)`, retrying with a numeric suffix on conflict (mirror the existing venue-slug retry loop in the same action), then `insert { name: <venueName>, slug }` and return the new id. **No `org_members` row.**
- Continue with the existing venue insert using the resolved `org_id`.
- Return shape extends to `{ venueId, orgId, orgCreated: boolean, orgName, alreadyExisted }` so the UI can toast "Created org 'Rye Plaza'" vs "Attached to 'Rye Plaza'".

Org name source: the venue's `name` from the staging payload. To use a different org name, edit the venue name in the staging record first (the detail view already supports editing) — no separate org-name field.

### UI: `PromoteForm`

- **Default:** "Auto — match or create org from the venue name," with a live preview of the resolved outcome (*attach to existing 'X'* / *create new 'X'*). Submitting calls `adminPromoteStagingVenue(rowId)` with no `orgId`.
- **Optional override:** retain the existing org dropdown as "Attach to a specific org instead" → calls the action with that `orgId`.
- Remove the hard "Select an organization" error.

### Edge cases

- **>1 normalized match** (rare given the dedup work): pick the **oldest** org deterministically; include `orgId`/`orgName` in the return so the admin can re-assign via the override if it's wrong.
- **Slug collision on create:** retry `organization_slugify` with a numeric suffix (same approach as venue slug).
- **Concurrency / unique-slug race:** if the org insert hits the slug unique index (`23505`), re-query for the now-existing org by normalized name and use it (treat as a match).
- Authorization unchanged: `assertAdmin()` gates the action; all writes on the service-role client.

### Testing

Unit-test `resolveOrgForVenue`:
1. Exact-name match → reuses, no new org.
2. Normalized match ("O'Dowd's" vs "Odowds") → reuses.
3. No match → creates with the expected slug; no `org_members` row.
4. Explicit override `orgId` → uses it, no match/create.
5. Slug collision → retries to a suffixed slug.

Plus the RLS/read paths are unaffected (no policy changes).

## Out of scope

- Searchable org combobox / inline create UI (the auto default + dropdown override covers the need).
- Editing the org name from the promote screen (edit the venue name upstream instead).
- Backfilling/merging existing duplicate orgs (handled by the prior dedup migration).
- Assigning an owner to an auto-created org (orgs are ownerless until claimed).

## Key references

- `apps/web/src/actions/admin-staging-actions.ts` (action to modify)
- `apps/web/src/app/admin/staging/_components/StagingActions.tsx` (`PromoteForm`)
- `supabase/migrations/20260502140757_dedupe_organizations_and_prevent_duplicate_orgs.sql` (`normalize_organization_name`, `organization_slugify`)
- `organizations` (name + slug required, no owner), `org_members` (user_id required)
