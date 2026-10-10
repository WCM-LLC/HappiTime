-- Inbox "Clear": users can dismiss notifications without deleting them.
--
-- Rows are kept because push bookkeeping (the per-user daily cap in
-- _shared/notify.ts) counts user_notifications.pushed_at; deleting rows would
-- let a user who clears their inbox receive more than the cap. The app filters
-- dismissed_at is null everywhere it reads the inbox (list + unread badge).
--
-- Requested by the owner 2026-10-09: "there needs to be a method to clear the
-- notifications box."

alter table public.user_notifications
  add column if not exists dismissed_at timestamptz;

comment on column public.user_notifications.dismissed_at is
  'Set when the user clears the row from their inbox. Row is kept for push bookkeeping; the app hides it.';

-- The update grant is column-scoped (see 20260914200000). Widen it to the two
-- user-writable columns; RLS user_notifications_update_own still scopes rows.
grant update (read_at, dismissed_at) on public.user_notifications to authenticated;

-- Inbox list query: user's visible rows, newest first.
create index if not exists user_notifications_inbox_idx
  on public.user_notifications (user_id, created_at desc)
  where dismissed_at is null;
