-- Nightly expiry for venue_events.
--
-- WHY: nothing ever removed an event once it had happened. On 2026-10-10 the
-- table held 246 published rows, of which 94 were one-offs already in the past
-- (the oldest from June) and 3 were series whose UNTIL had passed; 47 of the 89
-- live venues with events were showing at least one dead event under "Upcoming
-- Events". The only cleanup that had ever run was a manual pass on 2026-09-11.
-- The display side is fixed in the same PR (apps/*/src/lib/eventSchedule.mjs);
-- this stops the table refilling with rows no surface should show.
--
-- POLICY (J, 2026-10-10): expired events are DELETED, not set to 'archived'.
-- A stale row left in the live table is a row some future query forgets to
-- filter. The 'archived' status remains for an owner who retires an event by
-- hand; this job does not use it.
--
-- SAFETY NET: a job that deletes unattended needs an undo. Each row is copied
-- to archive.venue_events_expired as JSON before it is removed, and kept there
-- for 90 days, along with any event_media / intake_submission_events rows that
-- cascade with it (under "_event_media" and "_intake_submission_events" in the
-- snapshot). The archive schema is not exposed through the API. To restore:
--
--   insert into public.venue_events
--   select (jsonb_populate_record(null::public.venue_events, snapshot)).*
--     from archive.venue_events_expired where event_id = '<id>';
--
-- WHAT COUNTS AS EXPIRED (kept in agreement with eventSchedule.mjs):
--   one-off  (is_recurring = false): its end — ends_at, or starts_at when no
--            end was recorded — is more than p_grace in the past.
--   series   (is_recurring = true): its UNTIL is more than p_grace in the past,
--            or (older convention) ends_at is more than 36 hours after
--            starts_at and more than p_grace in the past.
--   A series with no UNTIL and no far-off ends_at never expires here.
-- Every status is in scope: a draft of an event that has already happened can
-- no longer be published, and an archived one is the stale row the policy
-- above is about.
--
-- The grace is deliberately longer than the 3 hours the UI uses to hide an
-- event: hiding is instant and reversible, deleting should lag behind it.

create schema if not exists archive;

create table if not exists archive.venue_events_expired (
  event_id     uuid primary key,
  venue_id     uuid not null,
  title        text not null,
  status       text not null,
  is_recurring boolean not null,
  starts_at    timestamptz not null,
  reason       text not null check (reason in ('one_off_ended', 'series_ended')),
  expired_at   timestamptz not null default now(),
  snapshot     jsonb not null
);

create index if not exists venue_events_expired_expired_at_idx
  on archive.venue_events_expired (expired_at);

comment on table archive.venue_events_expired is
  'Undo buffer for public.expire_venue_events(): full JSON of each deleted venue_events row, purged after 90 days.';

alter table archive.venue_events_expired enable row level security;
revoke all on archive.venue_events_expired from public, anon, authenticated;

-- The instant in a rule's UNTIL=YYYYMMDD[THHMMSS]Z, or null when there is none.
-- A date-only UNTIL means "through that day"; it is read here as 23:59:59 UTC,
-- a few hours earlier than the end of that day in Kansas City, which is what
-- the UI uses. The 24-hour grace below more than covers the difference, so the
-- job never deletes a series the UI still shows. Malformed digits (month 13) give
-- null rather than an error: one bad rule must not stop the whole nightly run.
create or replace function public.venue_event_series_until(p_rule text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_date text := substring(upper(coalesce(p_rule, '')) from 'UNTIL=(\d{8})');
  v_time text := substring(upper(coalesce(p_rule, '')) from 'UNTIL=\d{8}T(\d{6})');
begin
  if v_date is null then
    return null;
  end if;
  return make_timestamptz(
    substring(v_date from 1 for 4)::int,
    substring(v_date from 5 for 2)::int,
    substring(v_date from 7 for 2)::int,
    substring(coalesce(v_time, '235959') from 1 for 2)::int,
    substring(coalesce(v_time, '235959') from 3 for 2)::int,
    substring(coalesce(v_time, '235959') from 5 for 2)::double precision,
    'UTC'
  );
exception when others then
  return null;
end;
$$;

revoke all on function public.venue_event_series_until(text) from public, anon, authenticated;

create or replace function public.expire_venue_events(
  p_grace     interval default interval '24 hours',
  p_retention interval default interval '90 days'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff  timestamptz := now() - p_grace;
  v_deleted integer;
begin
  with doomed as (
    -- Lock what we are about to remove. Under READ COMMITTED a row that an
    -- owner is rescheduling right now is either skipped (still locked) or
    -- re-checked against this WHERE once their update commits — so an event
    -- that was just moved into the future is never deleted on its old dates.
    select
      ve.id,
      case when ve.is_recurring then 'series_ended' else 'one_off_ended' end as reason
    from public.venue_events ve
    where (
            not ve.is_recurring
        and greatest(ve.starts_at, coalesce(ve.ends_at, ve.starts_at)) < v_cutoff
          )
       or (
            ve.is_recurring
        and (
               public.venue_event_series_until(ve.recurrence_rule) < v_cutoff
            or (ve.ends_at - ve.starts_at > interval '36 hours' and ve.ends_at < v_cutoff)
            )
          )
    for update of ve skip locked
  ),
  archived as (
    insert into archive.venue_events_expired
      (event_id, venue_id, title, status, is_recurring, starts_at, reason, snapshot)
    select ve.id, ve.venue_id, ve.title, ve.status, ve.is_recurring, ve.starts_at,
           d.reason,
           -- event_media and intake_submission_events cascade on delete, so
           -- their rows ride along in the snapshot under underscore keys.
           -- jsonb_populate_record ignores keys that are not columns, so the
           -- restore statement in the header still works unchanged.
           to_jsonb(ve) || jsonb_build_object(
             '_event_media',
               (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                  from public.event_media m where m.event_id = ve.id),
             '_intake_submission_events',
               (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
                  from public.intake_submission_events i where i.event_id = ve.id)
           )
      from public.venue_events ve
      join doomed d on d.id = ve.id
    -- An id can only already be here if the row was restored and expired again.
    on conflict (event_id) do update
      set snapshot = excluded.snapshot,
          status = excluded.status,
          reason = excluded.reason,
          expired_at = now()
    returning event_id
  ),
  deleted as (
    -- Only rows whose snapshot was just written are removed.
    delete from public.venue_events ve
     using archived a
     where ve.id = a.event_id
    returning 1
  )
  select count(*) into v_deleted from deleted;

  delete from archive.venue_events_expired where expired_at < now() - p_retention;

  return v_deleted;
end;
$$;

comment on function public.expire_venue_events(interval, interval) is
  'Deletes venue_events that are over (one-offs past their end, series past UNTIL), after copying each to archive.venue_events_expired. Returns rows deleted. Run nightly by pg_cron.';

-- pg_cron runs as the owner. No API role may delete events by RPC.
revoke all on function public.expire_venue_events(interval, interval) from public, anon, authenticated;

-- 09:41 UTC = 4:41 AM CDT / 3:41 AM CST: after the last bar closes, before the
-- 6 AM venue digest. Guarded so a migration replay without pg_cron (CI, a fresh
-- environment) is a no-op rather than an error; mirrors
-- 20260613220157_add_validate_venues_wrapper_and_cron.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'expire-venue-events-nightly',
      '41 9 * * *',
      'SELECT public.expire_venue_events();'
    );
  end if;
end $$;
