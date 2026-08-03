# Mobile Notifications Inbox — Design

**Date:** 2026-07-29 · **Status:** Approved direction (owner chose: new `user_notifications` table; folded into the Activity tab) · **Apps touched:** supabase (migration + 6 edge functions), apps/mobile

## Problem

Pushes are fire-and-forget: six send paths resolve Expo push tokens and POST to Expo with no per-user record. A user who misses (or disables) push has no way to see what they were sent; nothing has read state; the Activity tab is a live-derived social feed, not a notification log. The owner wants an in-app inbox.

## Data model

One new table, recipient-scoped:

```sql
create table public.user_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,            -- same values as the push data.type contract
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,  -- mirrors the push `data` payload exactly
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index on public.user_notifications (user_id, created_at desc);
create index on public.user_notifications (user_id) where read_at is null;  -- badge count
```

- RLS: owner-only `select`; `update` restricted to setting `read_at` on own rows (write-side inserts come from edge functions using service role, so no insert policy for `authenticated`).
- Grants (repo trap — RLS alone is insufficient after the lockdown migrations): `grant select, update (read_at) on public.user_notifications to authenticated`.
- `type`/`data` mirror the existing push payload contract (`happy_hour`, `event`, `venue`, `friend`, `itinerary`, `visit_rating`) so the mobile app's existing `resolveNotificationTarget(data)` routes inbox taps with zero new routing code. `visit_rating` keeps its existing special case (modal, not navigation).
- Retention: none at launch (traffic is small). Revisit with a pg_cron cleanup if the table grows.

## Send-path consolidation

Three functions already use `_shared/expo-push.ts`; three hand-roll their own fetch (`notify-friend-activity`, `notify-venue-updates`, `evaluate-visit-ratings`). All six converge on one new shared helper:

```ts
// _shared/notify.ts
sendUserNotifications(supabaseAdmin, recipients: { userId: string }[], msg: { type, title, body, data })
```

which (1) inserts one `user_notifications` row per recipient (service role), then (2) pushes via the existing `sendExpoPush` to whichever recipients have tokens. Inserts happen first so the inbox is the source of truth even when Expo is down.

**Recipient resolution flips user-first.** Today the sender queries join `user_push_tokens!inner`, making token-less users invisible. Each function's query changes to resolve the user set first (still honoring the same per-category preference gates — `notifications_push` stays a push-only gate; `notifications_happy_hours` / `notifications_venue_updates` / `notifications_friend_activity` gate the row itself), then hand the set to the helper. Users who declined push still get inbox rows; users who disabled a category get neither.

## Mobile UI

- **Surface:** a "Notifications" segment added to ActivityScreen's existing `SegmentedTabs`, listing `user_notifications` newest-first (title, body, `timeAgo`, unread dot). Tapping a row marks it read and routes via `resolveNotificationTarget(row.data)`; `visit_rating` rows open the rating modal as today.
- **Badge:** unread count (`read_at is null`) as `tabBarBadge` on the Activity tab in `AppNavigator.tsx` (the only live navigator — `navigation/index.tsx` is dead code; copy its badge styling, don't extend it). Refresh on app foreground and after marking read.
- **Mark read:** on tap (single row) plus a "Mark all read" affordance in the segment header.
- **New hook:** `useUserNotifications` (list + unread count + markRead), owner-only queries under RLS.

## Rollout constraints

- **OTA is OFF** (expo-updates iOS-26 bug), so the mobile UI ships in the next store build — not before. The migration + edge-function changes are backend-only and can ship immediately; rows simply accumulate until the app catches up. This ordering is safe and desirable (history exists from day one of the build's release).
- Edge functions deploy via the existing flow; the migration auto-applies on master merge.

## Testing

- Pure helpers (recipient dedup, payload → row mapping) as `.mjs` with `node --test`, repo pattern.
- Edge-function tests follow the `send-venue-digest/index.test.ts` precedent for the user-first recipient queries.
- Static guards: all six senders import the shared helper (no hand-rolled Expo fetches left); `resolveNotificationTarget` stays the single routing table.
- RLS smoke: a `test/` static check on the migration (owner-only policies, the column-scoped update grant).

## Out of scope

- Web/console notifications, email digests (unchanged), notification preferences UI changes, retention/cleanup, and re-enabling OTA.
