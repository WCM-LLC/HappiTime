# HappiTime — Engineering TODOs

Immediate and near-term action items. For deferred or larger items see BACKLOG.md.

---

## Immediate

- [ ] **`HappyHourDetailScreen.tsx`** — Fix `colors.textTertiary` (TS2339). Replace with `colors.inputPlaceholder` or add `textTertiary` to the color palette. Two occurrences at lines 508 and 516.

- [ ] **`venue_subscriptions` / `user_plans` types** — Run `npm run supabase:gen-types` after confirming these tables exist in Supabase. Removes the `as any` casts in `shared-api/plans.ts` and `admin-plans-actions.ts`.

---

## Pricing-tier + attribution remodel follow-ups (filed 2026-05-30)

- [x] **Phase 3 — tier-aware consumer UI.** DONE + merged to `master` (`46a0ddb`).
  Directory (`venueTier.ts`, `VenueCard`/`VenueCardClient`, `NeighborhoodVenues`,
  `FilterableVenueGrid`) and mobile (its own `venueTier.ts`, `HomeScreen`,
  `App.tsx`, `EventCalendarScreen`) now read `featured`/`verified`/`listed` —
  the retired `'premium'`/`'basic'` vocabulary is gone. Verified: mobile
  typecheck 0 errors; `npm test` 82 pass / 0 fail. Split-out (NOT Phase 3):
  guide-eligibility gating, per-tier photo-size redesign.
- [x] **Phase 4.1 — `v_venue_active_tier` bundle override + directory read.** DONE
  (branch `feature/phase4-bundle-tier-read-path`). Spec:
  `docs/superpowers/specs/2026-05-30-phase4-bundle-tier-read-path-design.md`. The view
  now elevates an org's venues to featured-level when the org has an active bundle
  (`status active/trialing/pilot`), read via a `SECURITY DEFINER`
  `org_active_bundle_tier()` fn so the **anon** directory role gets the override
  without exposing rates (the view stays `security_invoker`). `queries.ts` reads the
  effective tier (`mergeEffectiveTiers`/`withEffectiveTiers`); cards unchanged.
  Verified no-op today (0 bundles) + live anon override (7/7 venues) on remote.
  Remaining Phase 4 sub-projects (own specs):
  - [x] **4-1b — mobile feed-query migration.** DONE (branch
    `feature/phase4-1b-mobile-tier-read`). Mobile reads the effective tier via its own
    `apps/mobile/src/lib/effectiveTier.ts` (mirrors web, drift-guarded). Wired:
    `useHappyHours`, `useUpcomingEvents`, `useUserLists`, `MapScreen` (both queries),
    `useFriendActivity` (partner set now from the view); `App.tsx` + `HomeScreen` inherit
    via `useHappyHours`, `EventCalendarScreen` via `useUpcomingEvents`. Verified: mobile
    typecheck 0 errors; `npm test` 93 pass. No DB change (same view/grants as 4.1).
    Caveat: `fetchPromotedVenueIds` returns all promoted venues globally — fine at today's
    scale (0), revisit the `.in()` filter if that set grows large.
  - [~] **4-2 — org bundle billing. BUILT + TYPE-CHECKED, MERGED-BUT-DORMANT — behavior
    UNVERIFIED.** Spec `docs/superpowers/specs/2026-05-31-phase4-2-org-bundle-billing-design.md`,
    plan `docs/superpowers/plans/2026-05-31-phase4-2-org-bundle-billing.md`. Shipped:
    `utils/bundle.ts` (pure, unit-tested), `getPriceIdForBundle`, `checkOrgBillingAccess`,
    `api/stripe/org-checkout`, webhook org-bundle branch (`org_subscriptions` upsert + cancels
    per-venue subs), `utils/bundle-sync.ts`, sync wired into venue create/delete. All new tests
    are source/`grep` drift guards + `bundle.ts` math — **no checkout/webhook/sync logic has
    executed.** To ACTIVATE + verify (none done yet):
    - [ ] Create the two Stripe products + set `STRIPE_PRODUCT_BUNDLE_2_4` / `STRIPE_PRODUCT_BUNDLE_5_PLUS`
      (until then checkout returns the clean config error; nothing activates).
    - [ ] Stripe **test-mode** checklist (in the plan). **Verify FIRST:** bundle activation actually
      cancels the org's per-venue subs (the two-step cancel query in `handleOrgBundleUpsert`) —
      a miss = silent double-billing.
    - [ ] Then: org venues read featured-level; add venue → quantity bump; cross 4→5 → price swap
      to `bundle_5_plus`; cancel bundle → reverts.
    - [ ] Revisit whether push edge functions honor bundles (deferred from 4.1).
    - Behavior note for 4-3: because activation cancels per-venue subs and nothing restores them,
      an org that later cancels its bundle drops to all-`listed` (loses its old per-venue tiers).
      Inherent in the "bundle cancels per-venue" decision — surface it deliberately in the UI.
  - [ ] **4-3 — org bundle management UI** (admin + org-owner view/manage a bundle).
  - [ ] **Remote migration-history note:** `20260531000000` was applied via MCP then the
    view/fn were corrected in-session via `execute_sql` (the anon fix), so the remote
    history's recorded SQL for that version is the pre-fix text; the live objects + the
    committed migration file are correct. Folds into the existing migration-drift item.
- [ ] **Stripe env var naming.** Tiers renamed but Stripe products reused
  (`verified`/`founding_pilot` → `STRIPE_PRODUCT_BASIC`, `featured` →
  `STRIPE_PRODUCT_FEATURED`). `STRIPE_PRODUCT_PREMIUM` is now unused. Optional
  rename later.
- [ ] **Latent no-op:** push edge functions guard `status != 'inactive'`, but
  `inactive` was never a valid `venue_subscriptions.status`. Pre-existing; left
  as-is to preserve behavior.
- [ ] **Mobile deep-link routing (Phase 2 leftover).** The QR landing emits
  `happitime://venue/{slug}` but the mobile app can't route it yet:
  `apps/mobile/src/navigation/index.tsx` has a bare `NavigationContainer` (no
  React Navigation `linking` config) and `VenuePreview` keys on `venueId`, not
  slug. Needs a `linking` map (prefixes `happitime://` + `https://happitime.app`)
  plus a slug→venueId resolver so the deep link opens the venue screen. The
  `/v/[slug]` web landing and in-app "I'm here" check-in are already shipped.
- [ ] **Remote migration-history drift.** `supabase_migrations.schema_migrations`
  on the remote registers only recent migrations; the ~30 older files in
  `supabase/migrations/` are not all tracked. A `supabase db push` from a fresh
  checkout may try to replay them. Pre-existing — needs a one-time
  `supabase migration repair`/baseline before relying on `db push`.

---

## Near-term

- [ ] **Add `SUPABASE_SERVICE_ROLE_KEY` to local `.env.local`** for admin features and the events ingest endpoint to work in development.

- [ ] **Add `ADMIN_EMAILS` to `.env.local`** — without it, all admin checks throw "Unauthorized". Comma-separated list of admin email addresses.

- [ ] **Add `EVENTS_INGEST_API_KEY` to `.env.local`** — required for `/api/events/ingest` to accept requests.

- [ ] **Wire unread badge in Activity tab** — see BACKLOG.md: "Activity tab unread badge". `unreadCount` is hardcoded to `null` in `navigation/index.tsx`.

- [ ] **`ConfirmDeleteForm.tsx`** — Replace `window.confirm()` with shadcn `<Dialog>` for accessibility. See BACKLOG.md.

- [ ] **`access-actions.ts`** — Import `toStr` from `@/utils/form` to eliminate the local copy. Low risk, file-local change.

- [ ] **`apps/mobile/src/screens/HappyHourDetailScreen.tsx`** — VenuePreviewScreen no longer uses `getMediaPublicUrl` (it was removed from `useVenueMedia`). Confirm no other screens import the function; clean up any lingering import attempts.
