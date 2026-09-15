-- 20260914200000_notification_webhook_triggers.sql
--
-- Wires the two event-driven notification functions that were written as
-- "database webhook" consumers but never had a producer:
--   notify-friend-activity   <- user_follows (INSERT / UPDATE OF status),
--                               user_followed_venues (INSERT)
--   notify-venue-updates     <- happy_hour_windows (INSERT / UPDATE, published,
--                               visible-field change only)
--
-- Verified 2026-09-14: no triggers existed on any of these tables, and
-- user_notifications held zero friend / happy_hour rows in 60 days.
--
-- Mechanics mirror invoke_notify_events(): SECURITY DEFINER, token from
-- private.notify_job_tokens, pg_net POST (async — never blocks the write).
-- The trigger body is wrapped so a notification failure can NEVER fail a
-- follow, a save, or a venue edit.
--
-- Idempotent: safe to re-run (CI db push after a manual apply).

create or replace function public.notify_edge_webhook()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_fn      text := tg_argv[0];
  v_token   text;
  v_payload jsonb;
begin
  begin
    select token into v_token
      from private.notify_job_tokens
     order by updated_at desc
     limit 1;

    if v_token is null then
      raise warning '[notify_edge_webhook] no notify token; skipping %', v_fn;
      return null;
    end if;

    v_payload := jsonb_build_object(
      'type',       tg_op,
      'table',      tg_table_name,
      'schema',     tg_table_schema,
      'record',     to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
    );

    perform net.http_post(
      url     := 'https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/' || v_fn,
      headers := jsonb_build_object(
        'x-notify-token', v_token,
        'content-type',   'application/json'
      ),
      body    := v_payload,
      timeout_milliseconds := 30000
    );
  exception when others then
    -- Never let a push failure block the user's write.
    raise warning '[notify_edge_webhook] % failed: %', v_fn, sqlerrm;
  end;
  return null;
end;
$$;

comment on function public.notify_edge_webhook() is
  'AFTER-trigger helper: POSTs {type,table,record,old_record} to an edge function via pg_net with the x-notify-token. Arg 0 = function slug. Added 2026-09-14.';

revoke all on function public.notify_edge_webhook() from public, anon, authenticated;

-- ── user_follows → notify-friend-activity ────────────────────────────────────
-- INSERT: pending = "wants to follow you"; accepted = "started following you".
-- UPDATE OF status: pending→accepted = "accepted your request" (to requester).
drop trigger if exists user_follows_notify on public.user_follows;
create trigger user_follows_notify
  after insert or update of status on public.user_follows
  for each row
  execute function public.notify_edge_webhook('notify-friend-activity');

-- ── user_followed_venues → notify-friend-activity (venue_save fan-out) ───────
drop trigger if exists user_followed_venues_notify on public.user_followed_venues;
create trigger user_followed_venues_notify
  after insert on public.user_followed_venues
  for each row
  execute function public.notify_edge_webhook('notify-friend-activity');

-- ── happy_hour_windows → notify-venue-updates ────────────────────────────────
-- Only published rows, and on UPDATE only when a follower-visible field
-- changed. updated_at / last_confirmed_at / verification touches do not fire.
-- The function re-checks old_record as a second guard.
drop trigger if exists happy_hour_windows_notify_insert on public.happy_hour_windows;
create trigger happy_hour_windows_notify_insert
  after insert on public.happy_hour_windows
  for each row
  when (new.status = 'published')
  execute function public.notify_edge_webhook('notify-venue-updates');

drop trigger if exists happy_hour_windows_notify_update on public.happy_hour_windows;
create trigger happy_hour_windows_notify_update
  after update on public.happy_hour_windows
  for each row
  when (
    new.status = 'published'
    and (
      old.status     is distinct from new.status
      or old.start_time is distinct from new.start_time
      or old.end_time   is distinct from new.end_time
      or old.dow        is distinct from new.dow
      or old.label      is distinct from new.label
    )
  )
  execute function public.notify_edge_webhook('notify-venue-updates');
