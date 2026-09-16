-- 20260915191112_push_bookkeeping.sql
--
-- Push bookkeeping for the per-user daily push cap.
--
-- Consumer pushes were opened to every published venue on 2026-09-14
-- (push-gate.ts, PUSH_GATE_MODE=all). A user following N venues can now get
-- N happy-hour / event pushes inside one hour. _shared/notify.ts enforces a
-- per-user daily cap plus quiet hours (America/Chicago), and it needs to know
-- which inbox rows actually went out as a push. Inbox rows are always written
-- regardless of the cap; only the push is suppressed, so pushed_at is NULL for
-- inbox-only rows and set to the send instant for rows that were pushed.
--
-- Idempotent: safe to re-run (CI db push after a manual apply).

alter table public.user_notifications
  add column if not exists pushed_at timestamptz;

comment on column public.user_notifications.pushed_at is
  'Instant the Expo push for this row was sent. NULL = inbox-only (no token, push disabled, quiet hours, or daily cap). Counted per user per America/Chicago day by _shared/notify.ts.';

-- Partial: the cap query only ever reads rows that were pushed.
create index if not exists user_notifications_user_pushed_at_idx
  on public.user_notifications (user_id, pushed_at)
  where pushed_at is not null;
