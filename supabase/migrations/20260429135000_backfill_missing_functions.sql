-- Backfill: functions that were created directly in prod and never captured in a migration.
-- Uses CREATE OR REPLACE throughout — idempotent on prod, needed for local db reset.
-- Includes search_path pins matching the Phase 1 security hardening already applied to prod.

BEGIN;

-- ── Trigger: set updated_at on INSERT/UPDATE ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Trigger: copy org name onto venue row at INSERT/UPDATE ────────────────────
CREATE OR REPLACE FUNCTION public.set_venue_org_name()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
begin
  if new.org_id is null then
    new.org_name := null;
    return new;
  end if;

  select o.name
    into new.org_name
    from public.organizations o
   where o.id = new.org_id;

  return new;
end;
$$;

-- ── Trigger: propagate org name change to all its venues ──────────────────────
CREATE OR REPLACE FUNCTION public.propagate_org_name_to_venues()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
begin
  if new.name is distinct from old.name then
    update public.venues
       set org_name = new.name
     where org_id = new.id;
  end if;

  return new;
end;
$$;

-- ── Trigger: queue venue for geocoding when address changes ───────────────────
CREATE OR REPLACE FUNCTION public.venues_queue_geocode()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
declare
  address_changed boolean := false;
  latlng_changed boolean := false;
  has_address boolean := false;
begin
  has_address :=
    coalesce(new.address, '') <> '' or
    coalesce(new.city, '') <> '' or
    coalesce(new.state, '') <> '' or
    nullif(trim(new.zip::text), '') is not null;

  if tg_op = 'INSERT' then
    address_changed := true;
    latlng_changed := new.lat is not null and new.lng is not null;
  else
    address_changed :=
      coalesce(new.address, '') <> coalesce(old.address, '') or
      coalesce(new.city, '') <> coalesce(old.city, '') or
      coalesce(new.state, '') <> coalesce(old.state, '') or
      coalesce(new.zip::text, '') <> coalesce(old.zip::text, '');

    latlng_changed :=
      new.lat is not null and new.lng is not null and (
        old.lat is distinct from new.lat or
        old.lng is distinct from new.lng
      );
  end if;

  if address_changed then
    new.geocode_last_error := null;
    new.geocode_attempts := 0;
    new.geocode_last_attempt_at := null;
    new.geocoded_at := null;

    if latlng_changed then
      new.geocode_status := 'success';
      new.geocoded_at := now();
      new.geocode_requested_at := now();
      new.geocode_next_attempt_at := null;
    elsif has_address then
      new.geocode_status := 'pending';
      new.geocode_requested_at := now();
      new.geocode_next_attempt_at := now();
      new.lat := null;
      new.lng := null;
    else
      new.geocode_status := 'skipped';
      new.geocode_requested_at := null;
      new.geocode_next_attempt_at := null;
      new.lat := null;
      new.lng := null;
    end if;
  end if;

  return new;
end;
$$;

-- ── Trigger: queue venue for Places API sync when name/address changes ─────────
CREATE OR REPLACE FUNCTION public.venues_queue_places_sync()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
declare
  address_changed boolean := false;
  has_address boolean := false;
  name_changed boolean := false;
  has_name boolean := false;
  jwt_role text := current_setting('request.jwt.claim.role', true);
begin
  if tg_op = 'UPDATE' and jwt_role = 'service_role' then
    return new;
  end if;

  has_name := coalesce(trim(new.name), '') <> '';
  has_address :=
    coalesce(new.address, '') <> '' or
    coalesce(new.city, '') <> '' or
    coalesce(new.state, '') <> '' or
    nullif(trim(new.zip::text), '') is not null;

  if tg_op = 'INSERT' then
    name_changed := true;
    address_changed := true;
  else
    name_changed := coalesce(trim(new.name), '') <> coalesce(trim(old.name), '');
    address_changed :=
      coalesce(new.address, '') <> coalesce(old.address, '') or
      coalesce(new.city, '') <> coalesce(old.city, '') or
      coalesce(new.state, '') <> coalesce(old.state, '') or
      coalesce(new.zip::text, '') <> coalesce(old.zip::text, '');
  end if;

  if name_changed or address_changed then
    new.places_attempts := 0;
    new.places_last_error := null;
    new.places_last_synced_at := null;
    new.places_id := null;

    if has_name and has_address then
      new.places_status := 'pending';
      new.places_next_sync_at := now();
    else
      new.places_status := 'skipped';
      new.places_next_sync_at := null;
    end if;
  end if;

  return new;
end;
$$;

-- ── Utility: parse free-text day strings into day arrays ─────────────────────
CREATE OR REPLACE FUNCTION public.hh_days_from_text(s text)
  RETURNS text[] LANGUAGE plpgsql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
AS $$
declare
  out_days text[] := '{}';
  t text := lower(coalesce(s,''));
begin
  if t like '%daily%' then
    return ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  end if;

  if t like '%mon-fri%' then out_days := out_days || ARRAY['Mon','Tue','Wed','Thu','Fri']; end if;
  if t like '%mon-thu%' then out_days := out_days || ARRAY['Mon','Tue','Wed','Thu']; end if;
  if t like '%mon-sat%' then out_days := out_days || ARRAY['Mon','Tue','Wed','Thu','Fri','Sat']; end if;
  if t like '%tue-fri%' then out_days := out_days || ARRAY['Tue','Wed','Thu','Fri']; end if;

  if t like '%sunday%' or t like '% sun%' then out_days := out_days || ARRAY['Sun']; end if;
  if t like '%saturday%' or t like '% sat%' then out_days := out_days || ARRAY['Sat']; end if;
  if (t like '%friday%' or t like '% fri%') and t not like '%mon-fri%' then out_days := out_days || ARRAY['Fri']; end if;
  if (t like '%thursday%' or t like '% thu%') and t not like '%mon-thu%' then out_days := out_days || ARRAY['Thu']; end if;
  if t like '%wednesday%' or t like '% wed%' then out_days := out_days || ARRAY['Wed']; end if;
  if (t like '%tuesday%' or t like '% tue%') and t not like '%tue-fri%' then out_days := out_days || ARRAY['Tue']; end if;
  if (t like '%monday%' or t like '% mon%') and t not like '%mon-%' then out_days := out_days || ARRAY['Mon']; end if;

  select coalesce(array_agg(distinct x), '{}') into out_days
  from unnest(out_days) as x;

  return out_days;
end
$$;

-- ── Utility: return caller's UID and JWT claims ───────────────────────────────
CREATE OR REPLACE FUNCTION public.whoami()
  RETURNS jsonb LANGUAGE sql STABLE
  SET search_path TO 'public', 'pg_temp'
AS $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'claims', auth.jwt()
  );
$$;

-- ── create_organization stub ─────────────────────────────────────────────────
-- Exists on prod (created directly). IF NOT EXISTS guard prevents overwriting it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'create_organization'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.create_organization(p_name text)
        RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
        SET search_path TO 'public'
      AS 'BEGIN RETURN gen_random_uuid(); END';
    $fn$;
  END IF;
END $$;

-- ── Cron stubs: only create if the function does NOT already exist ────────────
-- These are no-ops on prod (real implementations already exist there).
-- On fresh local db reset these stubs satisfy Phase 1 ALTER/REVOKE targets.
-- Using CREATE (not CREATE OR REPLACE) inside an existence check prevents
-- accidentally overwriting real prod functions with stubs.

CREATE SCHEMA IF NOT EXISTS private;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'get_geocode_job_token'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_geocode_job_token()
        RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path TO 'private', 'public'
      AS 'SELECT NULL::text';
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'get_places_job_token'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_places_job_token()
        RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path TO 'private', 'public'
      AS 'SELECT NULL::text';
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'invoke_geocode_venues'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.invoke_geocode_venues()
        RETURNS void LANGUAGE plpgsql SECURITY DEFINER
        SET search_path TO 'public', 'extensions'
      AS 'BEGIN NULL; END';
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'invoke_places_import'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.invoke_places_import()
        RETURNS void LANGUAGE plpgsql SECURITY DEFINER
        SET search_path TO 'public', 'extensions'
      AS 'BEGIN NULL; END';
    $fn$;
  END IF;
END $$;

-- create_organization is defined in 20260108072000_mobile_user_accounts.sql — no stub needed.

COMMIT;
