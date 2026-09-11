-- supabase/migrations/20260731120000_user_notifications.sql
--
-- Notifications inbox spine (spec: docs/superpowers/specs/2026-07-29-mobile-
-- notifications-inbox-design.md). One row per (recipient, notification);
-- type/data mirror the push payload contract so mobile routing is unchanged.
-- Writes come only from edge functions using the service role.

create table public.user_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

-- Partial index sized for the unread badge count.
create index user_notifications_unread_idx
  on public.user_notifications (user_id) where read_at is null;

alter table public.user_notifications enable row level security;

create policy user_notifications_select_own
  on public.user_notifications
  for select to authenticated
  using (user_id = auth.uid());

-- The update grant below is column-scoped to read_at, so this policy only
-- ever authorizes marking one's own rows read.
create policy user_notifications_update_own
  on public.user_notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.user_notifications from anon, authenticated;
grant select on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;
