# Post-MVP TODOs

Items identified during the MVP stabilisation pass. None are blockers for launch.

---

## Infrastructure / DevOps

- **`supabase db push` for 7 pending migrations** — The following idempotent migrations are tracked locally but not yet applied to production. Run `npx supabase db push` (with Docker running) or apply via Supabase dashboard:
  - `20260317212017_create_events_table.sql`
  - `20260317213218_add_events_rls.sql`
  - `20260319093100_add_venue_promotion_fields.sql`
  - `20260319152130_create_venue_event_counts.sql`
  - `20260322104200_add_venue_tags.sql`
  - `20260423130000_events_cuisine_tags.sql`
  - `20260426120000_fix_authenticated_select_policies.sql`

---

## Feature stubs (gated via `featureFlags.ts`)

- **Venue search** (`services/search.ts`, flag: `featureFlags.search`)  
  Set `NEXT_PUBLIC_SEARCH_API_URL` to a live search endpoint to enable. Returns `[]` when unset.

- **Venue recommendations** (`services/search.ts`, flag: `featureFlags.recommendations`)  
  Set `NEXT_PUBLIC_RECOMMENDATIONS_API_URL`. Returns `[]` when unset.

- **Web push notifications** (`services/notifications.ts`, flag: `featureFlags.webPush`)  
  Wire FCM/VAPID, then set `NEXT_PUBLIC_WEB_PUSH_ENABLED=true`. Functions `scheduleLocalNotification`, `cancelLocalNotification`, and `registerPushToken` are no-ops until then.

---

## Mobile TypeScript errors (pre-existing, 21 errors across 6 files)

See `docs/mobile-typecheck-errors.md` for the full list and suggested fixes.

---

## Mobile TODOs (in-source)

- `apps/mobile/src/navigation/index.tsx:38` — wire `unreadCount` to activity/notification state
- `apps/mobile/src/screens/HappyHourDetailScreen.tsx:416` — show menu items once venue adds them

---

## Shared-api type alignment

- `createClient()` in `apps/web/src/utils/supabase/server.ts` does not pass the `Database` generic.  
  All shared-api callsites use `supabase as any` to work around this. Fix: thread `Database` into `createServerClient<Database>(...)`. Low risk but requires updating all `createClient()` callers to confirm the typed client type is satisfied.

---

## Auth / session

- `apps/web/src/utils/admin.ts` uses a module-level `_adminEmailsLogged` flag. In serverless/edge environments this resets on cold start — that's fine, but worth noting for observability.

---

## Admin email gate

- `ADMIN_EMAILS` is currently the only admin auth mechanism. For production, consider adding a `is_admin` column to `org_members` or a dedicated `admin_users` table with proper RLS so the list is not solely stored in an env var.
