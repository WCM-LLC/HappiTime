# HappiTime — Engineering TODOs

Immediate and near-term action items. For deferred or larger items see BACKLOG.md.

---

## Immediate

- [x] **`HappyHourDetailScreen.tsx`** — `colors.textTertiary` (TS2339): resolved. No `textTertiary` reference remains in `apps/mobile/src`; mobile `tsc` is 0 errors (verified 2026-05-31).

- [ ] **`venue_subscriptions` / `user_plans` types** — Run `npm run supabase:gen-types` to drop the 3 `as any` casts in `apps/web/src/actions/admin-plans-actions.ts` (lines 46/62/96). `shared-api/plans.ts` no longer has casts (stale). NOTE: `gen-types` uses `--local`, so it needs `supabase start` + a clean migration apply; do it deliberately and inspect the 76KB `generated.ts` diff given the open "Remote migration-history drift" item — not a blind run. Non-blocking (0 type errors today).

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
  - [~] **4-2 — org bundle billing. BUILT + CORE PATH LIVE-VERIFIED (test mode); not yet
    activated in any env.** Spec `docs/superpowers/specs/2026-05-31-phase4-2-org-bundle-billing-design.md`,
    plan `docs/superpowers/plans/2026-05-31-phase4-2-org-bundle-billing.md`. Shipped:
    `utils/bundle.ts` (pure, unit-tested), `getPriceIdForBundle`, `checkOrgBillingAccess`,
    `api/stripe/org-checkout`, webhook org-bundle branch (`org_subscriptions` upsert + cancels
    per-venue subs via a dependency-free two-step query), `utils/bundle-sync.ts`, sync wired into
    venue create/delete.
    - **Stripe TEST products created** (2026-05-31): `STRIPE_PRODUCT_BUNDLE_2_4=prod_UcH9hy1Lt62p3W`
      ($79/venue), `STRIPE_PRODUCT_BUNDLE_5_PLUS=prod_UcH90QuzjF6lRq` ($59/venue). Test-mode only.
    - **Live-verified end-to-end (2026-05-31, throwaway org on prod, fully torn down):** real webhook
      → `org_subscriptions` upserted (tier/status/`venue_count`/rate); both org venues elevated to
      `bundle_2_4` in `v_venue_active_tier`; the org's per-venue sub was found + **cancelled in Stripe**
      (status=canceled) — the double-billing guard works. Price resolution + checkout-session +
      quantity math also confirmed.
    - **Live-verified (2026-05-31, throwaway org on prod, torn down):**
      - [x] `syncBundleQuantity` — recount 2→5 bumped Stripe quantity AND swapped the item price to
        `bundle_5_plus`; `org_subscriptions` reconciled to `bundle_5_plus`/`venue_count=5`/rate 5900.
        **Bug found + fixed during this run:** the swap updated the item price but not
        `sub.metadata.bundle_tier`, so the reconciling webhook wrote a STALE tier/rate to
        `org_subscriptions` (recorded `bundle_2_4`/$79 while Stripe billed `bundle_5_plus`/$59).
        Fixed in `bundle-sync.ts` (also move `metadata.bundle_tier` on swap); re-verified correct.
      - [x] `invoice.payment_failed` → `org_subscriptions` `past_due`; read path then drops all the
        org's venues back to `listed` (active-status gate). Verified via a real failing-charge invoice.
      - [x] **org-checkout route** — gates verified live (no/bad Origin → 403; valid Origin, no auth →
        401). Happy path verified via a temp admin-branch harness: access granted → `venueCount=2` →
        `bundle_2_4` → a real Checkout Session created with line item price=`bundle_2_4` qty=2 and a
        hosted URL. (Session retrieve doesn't echo `subscription_data`, but the route sets
        `{org_id, bundle_tier}` and that metadata→webhook→handler path is already proven live.)
      - [x] **Full hosted checkout — completed test payment (2026-05-31).** A real Stripe-hosted
        Checkout page was paid with test card 4242 ($0). `checkout.session.completed` → webhook →
        `handleOrgBundleUpsert` wrote `org_subscriptions` (`bundle_2_4`/active/`venue_count=2`) and
        both org venues elevated to `bundle_2_4` in the read view. **4-2 is now fully behavior-verified
        in test mode.** (The downstream `venue_subscriptions`→canceled + `promotion_tier`→null zeroing
        on per-venue cancellation is the PRE-EXISTING per-venue deletion handler, which fires when the
        cancelled sub carries `venue_id` metadata — real per-venue subs do.)
    - [x] **LIVE wiring DONE (2026-05-31).** Created LIVE Stripe products
      `STRIPE_PRODUCT_BUNDLE_2_4=prod_UcJq1bUfXByWv0` ($79/venue) and
      `STRIPE_PRODUCT_BUNDLE_5_PLUS=prod_UcJqYC8xytwYPi` ($59/venue), and set both as Production env
      vars on the `happitime/happitime-console` Vercel project. Activates on the next prod deploy
      (auto-deploys from `master`). The live webhook is already covered — bundle events use the same
      `/api/stripe/webhook` endpoint + `STRIPE_WEBHOOK_SECRET` as the per-venue flow (no new webhook
      config). Test product IDs (different): `prod_UcH9hy1Lt62p3W` / `prod_UcH90QuzjF6lRq`.
      - [ ] **Final live confirmation (your call — real money).** A real org owner completing a live
        bundle checkout with a real card is the only thing not exercised; test mode was fully verified
        end-to-end. Do a small real purchase + immediate cancel if you want production proof.
    - [ ] Revisit whether push edge functions honor bundles (deferred from 4.1).
    - Behavior note for 4-3: because activation cancels per-venue subs and nothing restores them,
      an org that later cancels its bundle drops to all-`listed` (loses its old per-venue tiers).
      Inherent in the "bundle cancels per-venue" decision — surface it deliberately in the UI.
  - [x] **4-3 — org bundle management UI.** DONE + merged (`993145c`). Spec
    `docs/superpowers/specs/2026-05-31-phase4-3-org-bundle-management-ui-design.md`, plan
    `docs/superpowers/plans/2026-05-31-phase4-3-org-bundle-management-ui.md`. Shipped: shared
    `createOrgBundleCheckoutSession` (org-checkout refactored to use it), `OrgBundlePanel` (owner
    start/manage on the org page), `/api/stripe/org-portal` route, admin actions
    (`adminGrantPilotBundle` / `adminCreateBundleCheckoutLink` / `adminCancelOrgBundle`), and an
    admin Org Bundles table. Built subagent-driven (TDD guard tests) with a full code review that
    caught + fixed two real UI bugs (status-aware panel: canceled rows re-offer Start; pilot comps
    have no portal so "Manage billing" is hidden). Verified: `npm test` 106 pass; web tsc 0 errors.
    - [x] **Manual UI click-through (test mode, 2026-05-31)** — DONE, throwaway org, fully torn down. Owner
      panel: start → Stripe Checkout (4242) → active card → "Manage billing" opens the portal. Admin table:
      lists the bundle → Cancel → `customer.subscription.deleted` → `status=canceled`, venues back to
      `listed`, and the panel re-offers "Start" (confirmed the review-fixed status-aware behavior live).
    - [x] **`?bundle=success` finalize state** DONE (`63cba02`) — panel shows "Finalizing…" + soft-refreshes
      (`router.refresh`) up to 3× after checkout so the active bundle appears without a manual reload.
    - [x] **Admin "generate checkout link" button** DONE (`63cba02`) — `AdminBundleLinkButton` surfaces the
      `adminCreateBundleCheckoutLink` action in the admin Org Bundles table.
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
  slug. Needs a `linking` map (prefixes `happitime://` + `https://happitime.biz`)
  plus a slug→venueId resolver so the deep link opens the venue screen. The
  `/v/[slug]` web landing and in-app "I'm here" check-in are already shipped.
  - **In-app scan confirmation (paired with the QR scan indicator).** The web
    landing now shows a visible "Scan recorded" banner
    (`apps/directory/.../v/[slug]/VenueLandingClient.tsx`), but when the deep link
    opens the native app the user sees no confirmation the scan registered. Once
    the `linking` map above lands, show a check-in toast/confirmation on the venue
    screen when it's opened via `happitime://venue/{slug}` (e.g. read a `?src=qr`
    param through the linking config and surface a brief "Checked in ✓").
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

- [x] **`access-actions.ts`** — Now imports `toStr` from `@/utils/form`; local copy removed (2026-05-31).

- [x] **`apps/mobile/src/screens/HappyHourDetailScreen.tsx`** — `getMediaPublicUrl` cleanup: resolved. No `getMediaPublicUrl` references remain in `apps/mobile/src` (verified 2026-05-31).
