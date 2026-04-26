# HappiTime — Engineering Backlog

Items here represent intentional deferrals: features that are partially wired, legacy code paths to remove, or known improvements that need a dedicated effort. Each item includes the affected files and a suggested next step.

---

## High Priority

### Remove legacy `venues.tags` text[] sync
**File:** `apps/web/src/actions/event-actions.ts` → `updateVenueTags`
**Description:** The `venue_tags` join table is the canonical source for venue tags. `updateVenueTags` also writes to `venues.tags` (a legacy `text[]` column) for backward compatibility. Once all consumers have migrated to querying `venue_tags`, the legacy sync block should be removed and the column dropped.
**Why deferred:** Directory and mobile consumers may still read `venues.tags` directly.
**Next step:** Audit all `venues.tags` column reads; replace with `venue_tags` joins; run migration to drop column.

### Activity tab unread badge
**File:** `apps/mobile/src/navigation/index.tsx` → `AppTabs`
**Description:** The Activity tab badge is wired up but `unreadCount` is hardcoded to `null`. Needs real-time subscription to unread activity/notification count.
**Why deferred:** Requires notification read-state tracking (a new table or column).
**Next step:** Add `last_read_at` to user profile or a separate `notification_reads` table; subscribe in `useUserFollowers` or a dedicated hook.

### Web push scheduling
**File:** `apps/web/src/services/notifications.ts`
**Description:** `scheduleLocalNotification`, `cancelLocalNotification`, and `registerPushToken` are stubs returning `null`. On mobile this is handled by Expo; the web stubs exist for API symmetry.
**Why deferred:** Web push requires a service worker and FCM/VAPID setup.
**Next step:** Implement with Web Push API + `web-push` npm package; integrate service worker in Next.js.

---

## Medium Priority

### Replace `window.confirm()` with accessible modal
**File:** `apps/web/src/components/ConfirmDeleteForm.tsx`
**Description:** Uses `window.confirm()` which blocks the main thread and is not accessible. Should be replaced with a focus-trapped modal dialog.
**Why deferred:** Requires a new modal component or shadcn Dialog integration.
**Next step:** Add `ConfirmDialog` using shadcn `<Dialog>`; wire to `ConfirmDeleteForm`.

### Remove `as any` casts in `shared-api/plans.ts`
**Files:** `packages/shared-api/src/plans.ts`, `packages/shared-api/src/client.ts`
**Description:** `venue_subscriptions` and `user_plans` tables exist in Supabase but are not present in the auto-generated types (`supabase/types/generated.ts`). This causes `(client as any)` casts.
**Why deferred:** Tables need to be confirmed in the schema and types re-generated.
**Next step:** Confirm tables exist in Supabase; run `npm run supabase:gen-types`; remove casts.

### Consolidate `assertAdmin` pattern in `access-actions.ts`
**File:** `apps/web/src/actions/access-actions.ts`
**Description:** `access-actions.ts` has its own auth-checking pattern (`requireOwner`) and local `toStr` helper that predate the shared utilities in `utils/form.ts` and `utils/admin.ts`.
**Why deferred:** `access-actions.ts` is 590+ lines and complex; risk of breaking invite flows.
**Next step:** Import `toStr` from `utils/form.ts` and align `requireOwner` with shared auth patterns after thorough testing.

### Support non-weekly recurrence rules for events
**File:** `apps/web/src/actions/event-actions.ts` → `buildWeeklyRRule`
**Description:** The recurrence builder only emits `FREQ=WEEKLY`. Monthly and custom frequencies are not supported.
**Why deferred:** UI does not expose other frequencies yet.
**Next step:** Extend `buildWeeklyRRule` (or replace with a proper RRULE library) and add UI controls for frequency selection.

### Legacy media table migration
**File:** `apps/web/src/services/media-store.ts`
**Description:** `media-store.ts` maintains dual-table support (`venue_media` vs legacy `media_assets`) with runtime table detection. Once all rows are in `venue_media`, the fallback logic can be removed.
**Why deferred:** Requires a data migration to confirm all legacy rows are moved.
**Next step:** Run migration; remove `resolveMediaTable` fallback; hard-code `venue_media`.

### Rate bucket memory on serverless cold starts
**File:** `apps/web/src/app/api/events/ingest/route.ts`
**Description:** `rateBuckets` is module-level state. On serverless (Vercel), instances are recycled, so the map is not truly persistent across requests. The stale-purge fix prevents unbounded growth within a single instance lifetime, but rate limiting is not enforced across instances.
**Why deferred:** Acceptable at current traffic; a distributed solution (Redis/Upstash) is needed at scale.
**Next step:** Add Upstash Redis via Vercel Marketplace; replace in-memory `rateBuckets` with Redis INCR/EXPIRE.

---

## Low Priority

### Geocoding fallback for Mapbox
**File:** `apps/web/src/services/maps.ts`
**Description:** `geocodeAddress` and `reverseGeocode` only support Google Maps. Mapbox users get static map URLs but no geocoding.
**Why deferred:** Google Maps is the default provider; Mapbox is optional.
**Next step:** Add Mapbox Geocoding API implementation behind provider check.

### Analytics provider detection deduplication
**File:** `apps/web/src/services/analytics.ts`
**Description:** Provider detection logic (`posthog`, `mixpanel`, `amplitude`, `segment`) is repeated across 4 functions. Should be extracted into a shared resolver.
**Why deferred:** Low bug risk; cosmetic improvement.
**Next step:** Extract `resolveProviders()` helper; use in all 4 functions.

### `access-actions.ts` `findAuthUserByEmail` pagination
**File:** `apps/web/src/actions/access-actions.ts`
**Description:** Paginates Supabase admin user list to find a user by email. At large user counts this becomes slow (200 users/page, no search filter).
**Why deferred:** Acceptable at current user count.
**Next step:** Use Supabase admin `getUserByEmail` if available in the SDK version, or add server-side filter.
