-- Schema-drift reconciliation, Stage 7: cron schedules + private job-token tables +
-- prune_cron_logs + the app_private<->private function relocation.
-- Plan: docs/superpowers/plans/2026-06-01-schema-drift-reconciliation.md (prod = target).
--
-- IDEMPOTENT / no-op on prod (tables IF NOT EXISTS, functions/triggers CREATE OR REPLACE,
-- grants idempotent, cron guarded). Includes one deliberate hardening (prune_cron_logs grant).

-- ── 1. private job-token tables (service_role-only; the get_*_job_token fns read them) ──
create table if not exists private.geocode_job_tokens (
  id         integer not null default 1,
  token      text not null,
  updated_at timestamptz not null default now(),
  constraint geocode_job_tokens_pkey primary key (id),
  constraint geocode_job_tokens_id_check check (id = 1)
);
create table if not exists private.places_job_tokens (
  id         integer not null default 1,
  token      text not null,
  updated_at timestamptz not null default now(),
  constraint places_job_tokens_pkey primary key (id),
  constraint places_job_tokens_id_check check (id = 1)
);
grant select, insert, update on table private.geocode_job_tokens to service_role;
grant select, insert, update on table private.places_job_tokens  to service_role;

-- ── 2. prune_cron_logs (SECURITY DEFINER) — captured + HARDENED ───────────────────
-- prod granted it to anon/authenticated; it is invoked only by the daily cron job (runs as
-- the job owner) — restrict EXECUTE to service_role + owner.
create or replace function public.prune_cron_logs()
  returns table(deleted_job_run_details bigint, deleted_http_responses bigint)
  language plpgsql security definer as $$
DECLARE
  v_jobs BIGINT := 0;
  v_http BIGINT := 0;
BEGIN
  DELETE FROM cron.job_run_details
   WHERE end_time < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS v_jobs = ROW_COUNT;

  DELETE FROM net._http_response
   WHERE created < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS v_http = ROW_COUNT;

  deleted_job_run_details := v_jobs;
  deleted_http_responses := v_http;
  RETURN NEXT;
END
$$;
revoke execute on function public.prune_cron_logs() from public, anon, authenticated;
grant execute on function public.prune_cron_logs() to service_role;

-- ── 3. Relocate the venue-visit trigger fns private -> app_private (match prod) ────
create or replace function app_private.prevent_duplicate_venue_visit() returns trigger
  language plpgsql set search_path to 'public', 'app_private' as $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.venue_visits vv
    WHERE vv.user_id = NEW.user_id
      AND vv.venue_id = NEW.venue_id
      AND vv.source = NEW.source
      AND vv.id <> NEW.id
      AND abs(extract(epoch FROM (vv.entered_at - NEW.entered_at))) < 7200
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'duplicate venue visit within two-hour window'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

create or replace function app_private.sync_venue_visit_user_event() returns trigger
  language plpgsql security definer set search_path to 'public', 'app_private' as $$
DECLARE
  v_event_type text;
  v_venue_name text;
  v_venue_published boolean := false;
  v_meta jsonb;
BEGIN
  v_event_type := CASE
    WHEN NEW.source = 'auto_proximity' THEN 'auto_checkin'
    ELSE 'venue_checkin'
  END;

  SELECT COALESCE(v.org_name, v.name), v.status = 'published'
  INTO v_venue_name, v_venue_published
  FROM public.venues v
  WHERE v.id = NEW.venue_id;

  v_meta := jsonb_build_object(
    'visit_id', NEW.id,
    'source', NEW.source,
    'is_private', NEW.is_private,
    'venue_name', v_venue_name,
    'venue_published', COALESCE(v_venue_published, false)
  );

  UPDATE public.user_events ue
  SET event_type = v_event_type,
      user_id = NEW.user_id,
      venue_id = NEW.venue_id,
      created_at = NEW.entered_at,
      meta = COALESCE(ue.meta, '{}'::jsonb) || v_meta
  WHERE ue.event_type IN ('auto_checkin', 'venue_checkin')
    AND ue.meta->>'visit_id' = NEW.id::text;

  IF NOT FOUND THEN
    INSERT INTO public.user_events (user_id, event_type, venue_id, meta, created_at)
    VALUES (NEW.user_id, v_event_type, NEW.venue_id, v_meta, NEW.entered_at);
  END IF;

  RETURN NEW;
END;
$$;
revoke all on function app_private.sync_venue_visit_user_event() from public;

-- retarget the triggers to the app_private functions, then drop the private copies
create or replace trigger venue_visits_prevent_duplicate_window
  before insert or update of user_id, venue_id, source, entered_at on public.venue_visits
  for each row execute function app_private.prevent_duplicate_venue_visit();
create or replace trigger venue_visits_sync_user_event
  after insert or update of user_id, venue_id, entered_at, source, is_private on public.venue_visits
  for each row execute function app_private.sync_venue_visit_user_event();

drop function if exists private.prevent_duplicate_venue_visit();
drop function if exists private.sync_venue_visit_user_event();

-- ── 4. cron schedules (guarded — only where pg_cron is installed, i.e. prod) ───────
-- cron.job rows are data (invisible to schema diffs); captured here for reproducibility.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('geocode-venues',        '*/10 * * * *', 'select public.invoke_geocode_venues();');
    perform cron.schedule('import-places',         '*/30 * * * *', 'select public.invoke_places_import();');
    perform cron.schedule('prune_cron_logs_daily', '17 3 * * *',   'SELECT public.prune_cron_logs();');
  end if;
end $$;
