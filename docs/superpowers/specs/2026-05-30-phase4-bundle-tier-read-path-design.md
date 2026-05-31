# Phase 4 — Org Bundle Tier — Read Path (Sub-project 1) — Design

**Date:** 2026-05-30
**Status:** Approved design, pre-implementation.
**Branch HEAD at authoring:** `master` `3b14d94` (Phase 3 merged + pushed to origin/master).

## Context

The 2026-05-30 pricing remodel (`supabase/migrations/20260530194305_pricing_tiers_remodel.sql`)
introduced **org-level bundles** in `public.org_subscriptions` (`bundle_2_4` $79/venue,
`bundle_5_plus` $59/venue) but shipped `v_venue_active_tier` as a deliberate placeholder:

```sql
select v.id as venue_id, coalesce(v.promotion_tier, 'listed') as tier from public.venues v;
```

The approved design's bundle override (active org bundle → its venues display at
featured-level) was deferred to "Phase 4" until bundles are wired. Nothing reads the
override yet.

### "Full bundle billing" decomposition (decided in brainstorm)

The user asked for full bundle billing. That is three subsystems, each its own
spec → plan → build cycle:

1. **Read path** (THIS spec) — the view computes the bundle override; consumers read the
   effective tier. Foundation. Ships as a verified no-op (no bundles sold yet) and lights
   up automatically when billing lands.
2. **Org bundle billing** — Stripe org-level checkout route + webhook handler writing
   `org_subscriptions`. Populates the data. (Separate spec.)
3. **Org bundle management UI** — admin + org-owner view/manage a bundle. (Separate spec.)

This document covers **sub-project 1 only**, and within it only the **web/directory** half
(decided below). Mobile feed-query migration is split to **sub-project 1b**.

### Why read-path first

With zero `org_subscriptions` rows, the `LEFT JOIN org_subscriptions` matches nothing, so the
recreated view returns exactly today's `COALESCE(promotion_tier,'listed')`. The change ships
as a **verified no-op** and activates when sub-project 2 sells the first bundle. Billing-first
would be invisible/untestable end-to-end until the read path exists.

## Decisions made (do not re-litigate)

- **Approach A — read-time override in the view** (not denormalization onto
  `venues.promotion_tier`). Rationale: bundle *cancellation*. Under A the view auto-reverts
  when a bundle ends (`promotion_tier` was never touched). Under B (denormalize) cancellation
  must recompute each venue's `promotion_tier` from its own `venue_subscriptions` row — the
  two-writer problem (per-venue webhook + bundle webhook fighting over one column), a real
  correctness risk. A also matches the migration's documented intent ("restore the LEFT JOIN
  org_subscriptions").
- **"Active bundle" = status only** (`active`/`trialing`/`pilot`). Mirrors the per-venue flow,
  which trusts Stripe-driven status and never gates on period dates. `current_period_end`
  stays informational.
- **Scope = web now, mobile follow-up.** Directory has one central venue fetch
  (`apps/directory/src/lib/queries.ts`); mobile fetches `promotion_tier` from ~6 independent
  query sites. "Web now, mobile next" is a clean seam, and mobile reflecting bundles later
  costs nothing in the interim (no bundles exist yet).
- **Push edge functions deferred** to the billing sub-project (they key off
  `promotion_tier` today; bundles influencing push is revisited when bundles actually sell).

## Architecture

### 1. The view (`v_venue_active_tier`)

New migration `supabase/migrations/<ts>_venue_active_tier_bundle_override.sql` drops and
recreates the view:

```sql
drop view if exists public.v_venue_active_tier;
create view public.v_venue_active_tier with (security_invoker = true) as
  select v.id as venue_id,
    case
      when v.promotion_tier in ('featured','bundle_2_4','bundle_5_plus')
        then v.promotion_tier                         -- self-paid featured-level wins, unchanged
      when os.org_id is not null then os.bundle_tier   -- active bundle elevates to featured-level
      else coalesce(v.promotion_tier, 'listed')
    end as tier
  from public.venues v
  left join public.org_subscriptions os
    on os.org_id = v.org_id
    and os.status in ('active','trialing','pilot');
grant select on public.v_venue_active_tier to anon, authenticated;
```

The CASE expresses `effective = max(own tier, bundle→featured)`:
- A venue with its own `featured`/`bundle_*` keeps that value (never relabeled).
- Otherwise an active bundle yields `os.bundle_tier` (`bundle_2_4`/`bundle_5_plus`), which
  `tierVariant` already maps to the **featured** variant.
- Otherwise `coalesce(promotion_tier,'listed')` — unchanged from today.

`security_invoker = true` is preserved: the view honors `venues` RLS (anon sees published
only) and exposes no financial columns (only `venue_id`, `tier`). The
`org_subscriptions` join touches only `org_id`/`status`/`bundle_tier`, never rates.

**Apply path:** applied to the remote project via Supabase MCP `apply_migration` (matching the
workflow noted in `20260530194305_pricing_tiers_remodel.sql`), with the file committed to
`supabase/migrations/` as the source of record.

### 2. Directory read migration

`apps/directory/src/lib/queries.ts` is the single central venue fetch. It selects
`promotion_tier` (line 88) and maps it in `mapVenue` (line 165:
`promotion_tier: raw.promotion_tier ?? null`).

Change: after the venue rows are fetched, batch-fetch effective tiers for those venue IDs from
the view and merge them in the mapping layer:

```ts
const { data: tiers } = await supabase
  .from('v_venue_active_tier')
  .select('venue_id, tier')
  .in('venue_id', ids);
// build Map<venue_id, tier>, then in mapVenue:
//   promotion_tier: effectiveTierById.get(raw.id) ?? raw.promotion_tier ?? null
```

The merge logic is extracted to a **pure function** (e.g. `mergeEffectiveTiers(rawVenues,
tierRows)`) so it is unit-testable without a live DB.

`VenueCard.tsx` / `VenueCardClient.tsx` already call `tierPresentation(venue.promotion_tier)`
— they receive the effective value through the same field, so **no card changes**. Sort/order
(`orderVenuesForDisplay`, which reads `venue.promotion_tier`) likewise operates on the
effective value automatically.

PostgREST view-embedding (`from('venues').select('…, v_venue_active_tier(tier)')`) is a
possible later optimization; the batched merge is chosen now to avoid embedding-relationship
uncertainty and keep the change self-contained.

### Data flow

```
venues.promotion_tier ──┐
                        ├─► v_venue_active_tier (view: max(own, bundle→featured)) ─► queries.ts
org_subscriptions ──────┘                                                            batched merge
   (status active)                                                                        │
                                                                                          ▼
                                                          venue.promotion_tier (= effective tier)
                                                                                          │
                                                          tierPresentation / orderVenuesForDisplay
                                                                                          ▼
                                                                       VenueCard / VenueCardClient
```

## Out of scope (own specs)

- **Sub-project 1b** — mobile feed-query migration (`useHappyHours`, `useUpcomingEvents`,
  `useUserLists`, `MapScreen`, `useFriendActivity`, `App.tsx`, `EventCalendarScreen`).
- **Sub-project 2** — org bundle billing: Stripe org-level checkout route + webhook handler
  populating `org_subscriptions`; revisit whether push edge functions honor bundles.
- **Sub-project 3** — org bundle management UI (admin + org owner).

## Testing

- **Migration guard test** (`test/*.mjs`, matching the existing source-grep guard pattern,
  e.g. the `venue_visits`/`check-in` migration tests): read the new migration file and assert
  it recreates `v_venue_active_tier` with `left join public.org_subscriptions`, the
  `status in ('active','trialing','pilot')` filter, and `security_invoker = true`.
- **Unit test** for `mergeEffectiveTiers`: effective tier overrides raw `promotion_tier` when a
  view row exists; falls back to raw when absent; a venue with own `featured` is unchanged; a
  `verified` venue under an active bundle reads `bundle_2_4`.
- **Manual DB verification:** insert one `org_subscriptions` row (`status='active'`) for an org
  with venues → `select * from v_venue_active_tier where venue_id in (…)` shows `bundle_*` for
  those venues; delete the row → reverts to `coalesce(promotion_tier,'listed')`. Confirm the
  directory renders the featured badge while the row exists.

## Verification gates

- `npm test` → green (existing 82 pass + the new guard/unit tests).
- `cd apps/directory && npx tsc --noEmit` → 0 errors.
- No-op confirmation: with zero `org_subscriptions` rows, the view output is byte-identical to
  the prior `COALESCE` for all venues.

## Rollback

`drop view if exists public.v_venue_active_tier;` then recreate the prior placeholder
(`coalesce(v.promotion_tier,'listed')`). The directory change is a plain revert of `queries.ts`
(cards untouched). No data migration, so rollback is safe at any time.
