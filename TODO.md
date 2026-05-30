# HappiTime — Engineering TODOs

Immediate and near-term action items. For deferred or larger items see BACKLOG.md.

---

## Immediate

- [ ] **`HappyHourDetailScreen.tsx`** — Fix `colors.textTertiary` (TS2339). Replace with `colors.inputPlaceholder` or add `textTertiary` to the color palette. Two occurrences at lines 508 and 516.

- [ ] **`venue_subscriptions` / `user_plans` types** — Run `npm run supabase:gen-types` after confirming these tables exist in Supabase. Removes the `as any` casts in `shared-api/plans.ts` and `admin-plans-actions.ts`.

---

## Pricing-tier + attribution remodel follow-ups (filed 2026-05-30)

- [ ] **Phase 3 — consumer apps still read OLD tier vocabulary.** The pricing
  remodel (basic→verified, premium retired) landed in the DB + web console,
  but these still gate/style on `'premium'`/`'basic'` (no longer valid tiers):
  `apps/directory/src/components/VenueCard.tsx`, `VenueCardClient.tsx`;
  `apps/mobile/App.tsx`, `apps/mobile/src/screens/HomeScreen.tsx`
  (incl. `PromoTier` type), `EventCalendarScreen.tsx`. No live impact yet (all
  venues `promotion_tier = NULL`); `'featured'` still matches so nothing
  crashes. Update with Phase 3 tier-aware consumer UI.
- [ ] **`v_venue_active_tier` bundle override deferred to Phase 4.** Ships as a
  simple `COALESCE(promotion_tier,'listed')` projection; the approved design's
  `org_subscriptions` bundle override (active bundle → featured-level) is
  deferred until bundles are wired. Restore the `LEFT JOIN org_subscriptions`
  then. Nothing reads the override yet.
- [ ] **Stripe env var naming.** Tiers renamed but Stripe products reused
  (`verified`/`founding_pilot` → `STRIPE_PRODUCT_BASIC`, `featured` →
  `STRIPE_PRODUCT_FEATURED`). `STRIPE_PRODUCT_PREMIUM` is now unused. Optional
  rename later.
- [ ] **Latent no-op:** push edge functions guard `status != 'inactive'`, but
  `inactive` was never a valid `venue_subscriptions.status`. Pre-existing; left
  as-is to preserve behavior.
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
