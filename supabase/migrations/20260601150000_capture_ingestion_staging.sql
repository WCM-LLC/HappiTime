-- Schema-drift reconciliation, Stage 3: capture the ingestion / staging subsystem.
-- Plan: docs/superpowers/plans/2026-06-01-schema-drift-reconciliation.md (prod = target).
--
-- The venue-ingestion pipeline (staging tables + merge function) and the verified-venue
-- protection + org-name propagation triggers were built on prod (dashboard) and never
-- committed, so a fresh replay lacks the tables the web admin staging UI (4 files) queries.
-- This captures prod's exact definitions. protect_verified_venues + merge_staging_venues are
-- prod-only; propagate_org_name_to_venues + set_venue_org_name already exist in migrations
-- (only their triggers are prod-only).
--
-- IDEMPOTENT / no-op on prod: tables CREATE TABLE IF NOT EXISTS (inline PK/FK/check),
-- indexes IF NOT EXISTS, functions/triggers CREATE OR REPLACE, policies drop-then-create,
-- grants idempotent.

-- 1. staging tables
create table if not exists public.staging_venues (
  id              uuid not null default gen_random_uuid(),
  source          text not null,
  source_run_id   text,
  external_ref    text,
  payload         jsonb not null,
  match_venue_id  uuid,
  status          text not null default 'pending',
  rejection_reason text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  constraint staging_venues_pkey primary key (id),
  constraint staging_venues_status_check check (status = any (array['pending','approved','rejected','merged','skipped'])),
  constraint staging_venues_match_venue_id_fkey foreign key (match_venue_id) references public.venues (id) on delete set null,
  constraint staging_venues_reviewed_by_fkey foreign key (reviewed_by) references auth.users (id)
);

create table if not exists public.staging_happy_hour_windows (
  id              uuid not null default gen_random_uuid(),
  source          text not null,
  source_run_id   text,
  payload         jsonb not null,
  match_window_id uuid,
  match_venue_id  uuid,
  status          text not null default 'pending',
  rejection_reason text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  constraint staging_happy_hour_windows_pkey primary key (id),
  constraint staging_happy_hour_windows_status_check check (status = any (array['pending','approved','rejected','merged','skipped'])),
  constraint staging_happy_hour_windows_match_venue_id_fkey foreign key (match_venue_id) references public.venues (id) on delete set null,
  constraint staging_happy_hour_windows_match_window_id_fkey foreign key (match_window_id) references public.happy_hour_windows (id) on delete set null,
  constraint staging_happy_hour_windows_reviewed_by_fkey foreign key (reviewed_by) references auth.users (id)
);

create index if not exists staging_venues_run_idx    on public.staging_venues using btree (source_run_id);
create index if not exists staging_venues_status_idx on public.staging_venues using btree (status);

-- 2. RLS: platform-admin only (admin staging review UI).
alter table public.staging_venues enable row level security;
drop policy if exists staging_venues_admin_all on public.staging_venues;
create policy staging_venues_admin_all on public.staging_venues to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

alter table public.staging_happy_hour_windows enable row level security;
drop policy if exists staging_hhw_admin_all on public.staging_happy_hour_windows;
create policy staging_hhw_admin_all on public.staging_happy_hour_windows to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

grant all on table public.staging_venues to anon, authenticated, service_role;
grant all on table public.staging_happy_hour_windows to anon, authenticated, service_role;

-- 3. Functions (prod-only). Bodies copied verbatim from prod.
create or replace function public.protect_verified_venues() returns trigger
  language plpgsql
  as $$
BEGIN
  IF OLD.is_verified = TRUE AND NEW.is_verified = TRUE THEN
    IF 'name'         = ANY(OLD.data_locked_fields) AND NEW.name         IS DISTINCT FROM OLD.name         THEN
      RAISE EXCEPTION 'venue.name is locked on verified venue %', OLD.id; END IF;
    IF 'address'      = ANY(OLD.data_locked_fields) AND NEW.address      IS DISTINCT FROM OLD.address      THEN
      RAISE EXCEPTION 'venue.address is locked on verified venue %', OLD.id; END IF;
    IF 'phone'        = ANY(OLD.data_locked_fields) AND NEW.phone        IS DISTINCT FROM OLD.phone        THEN
      RAISE EXCEPTION 'venue.phone is locked on verified venue %', OLD.id; END IF;
    IF 'website'      = ANY(OLD.data_locked_fields) AND NEW.website      IS DISTINCT FROM OLD.website      THEN
      RAISE EXCEPTION 'venue.website is locked on verified venue %', OLD.id; END IF;
    IF 'neighborhood' = ANY(OLD.data_locked_fields) AND NEW.neighborhood IS DISTINCT FROM OLD.neighborhood THEN
      RAISE EXCEPTION 'venue.neighborhood is locked on verified venue %', OLD.id; END IF;
    IF 'cuisine_type' = ANY(OLD.data_locked_fields) AND NEW.cuisine_type IS DISTINCT FROM OLD.cuisine_type THEN
      RAISE EXCEPTION 'venue.cuisine_type is locked on verified venue %', OLD.id; END IF;
    IF 'tags'         = ANY(OLD.data_locked_fields) AND NEW.tags         IS DISTINCT FROM OLD.tags         THEN
      RAISE EXCEPTION 'venue.tags is locked on verified venue %', OLD.id; END IF;
    IF 'price_tier'   = ANY(OLD.data_locked_fields) AND NEW.price_tier   IS DISTINCT FROM OLD.price_tier   THEN
      RAISE EXCEPTION 'venue.price_tier is locked on verified venue %', OLD.id; END IF;
  END IF;
  RETURN NEW;
END
$$;

create or replace function public.merge_staging_venues(p_source_run_id text, p_dry_run boolean default true)
  returns table(staging_id uuid, action text, venue_id uuid, reason text)
  language plpgsql security definer
  as $$
DECLARE
  r RECORD;
  v_existing public.venues%ROWTYPE;
  v_action TEXT;
  v_reason TEXT;
  v_venue_id UUID;
BEGIN
  FOR r IN
    SELECT * FROM public.staging_venues
    WHERE source_run_id = p_source_run_id
      AND status = 'pending'
  LOOP
    v_action := NULL; v_reason := NULL; v_venue_id := NULL;

    IF r.match_venue_id IS NULL THEN
      v_action := 'insert';
      v_reason := 'new venue from pull';
      v_venue_id := NULL;
    ELSE
      SELECT * INTO v_existing FROM public.venues WHERE id = r.match_venue_id;

      IF v_existing.is_verified THEN
        v_action := 'skip';
        v_reason := 'venue is verified - pull cannot overwrite';
        v_venue_id := v_existing.id;
      ELSE
        v_action := 'update';
        v_reason := 'unverified venue - safe to enrich';
        v_venue_id := v_existing.id;

        IF NOT p_dry_run THEN
          UPDATE public.venues v SET
            name        = COALESCE(NULLIF(r.payload->>'name', ''),       v.name),
            address     = COALESCE(NULLIF(r.payload->>'address', ''),    v.address),
            phone       = COALESCE(NULLIF(r.payload->>'phone', ''),      v.phone),
            website     = COALESCE(NULLIF(r.payload->>'website', ''),    v.website),
            neighborhood= COALESCE(NULLIF(r.payload->>'neighborhood',''),v.neighborhood),
            cuisine_type= COALESCE(NULLIF(r.payload->>'cuisine_type',''),v.cuisine_type),
            updated_at  = NOW()
          WHERE v.id = v_existing.id
            AND NOT v.is_verified;
        END IF;
      END IF;
    END IF;

    IF NOT p_dry_run AND v_action <> 'insert' THEN
      UPDATE public.staging_venues
        SET status = CASE WHEN v_action = 'skip' THEN 'skipped' ELSE 'merged' END,
            reviewed_at = NOW()
        WHERE id = r.id;
    END IF;

    staging_id := r.id;
    action := v_action;
    venue_id := v_venue_id;
    reason := v_reason;
    RETURN NEXT;
  END LOOP;

  RETURN;
END
$$;

grant all on function public.merge_staging_venues(p_source_run_id text, p_dry_run boolean) to anon, authenticated, service_role;

-- 4. Triggers (prod-only). Their functions: protect_verified_venues + merge_staging_venues
-- above; propagate_org_name_to_venues + set_venue_org_name already exist in earlier migrations.
create or replace trigger trg_protect_verified_venues before update on public.venues
  for each row execute function public.protect_verified_venues();
create or replace trigger trg_propagate_org_name after update of name on public.organizations
  for each row execute function public.propagate_org_name_to_venues();
create or replace trigger trg_set_venue_org_name before insert or update of org_id on public.venues
  for each row execute function public.set_venue_org_name();
