-- Schema-drift reconciliation, Stage 2: capture the `neighborhoods` subsystem.
-- Plan: docs/superpowers/plans/2026-06-01-schema-drift-reconciliation.md (prod = target).
--
-- `neighborhoods` + the `neighborhood_tier` type + `v_kcmo_neighborhoods` were built
-- directly on prod (dashboard) and never committed, so a fresh migration replay lacks the
-- table the directory app's KC-neighborhoods feature (15 files) queries — breaking local
-- dev / CI preview branches / restores. This captures prod's exact definitions.
--
-- IDEMPOTENT / no-op on prod (it already has all of this): type is DO-guarded, table is
-- CREATE TABLE IF NOT EXISTS (with inline PK + self-FK), index IF NOT EXISTS, policies are
-- drop-then-create, view is CREATE OR REPLACE, grants are inherently idempotent.

-- 1. tier enum
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'neighborhood_tier'
  ) then
    create type public.neighborhood_tier as enum ('kcmo', 'metro_mo', 'metro_ks');
  end if;
end $$;

-- 2. table (inline PK + self-referential parent FK; skipped wholesale on prod)
create table if not exists public.neighborhoods (
  slug         text not null,
  label        text not null,
  city         text not null default 'Kansas City',
  state        text not null default 'MO',
  parent_slug  text,
  is_active    boolean not null default true,
  sort_order   integer not null default 100,
  centroid_lat double precision,
  centroid_lng double precision,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  tier         public.neighborhood_tier not null default 'kcmo',
  constraint neighborhoods_pkey primary key (slug),
  constraint neighborhoods_parent_slug_fkey foreign key (parent_slug)
    references public.neighborhoods (slug) on delete set null
);

create index if not exists idx_neighborhoods_tier
  on public.neighborhoods using btree (tier) where (is_active);

-- 3. RLS: public read; writes are service-role only (reference data for the public directory).
alter table public.neighborhoods enable row level security;
drop policy if exists "Anyone can read neighborhoods" on public.neighborhoods;
create policy "Anyone can read neighborhoods" on public.neighborhoods for select using (true);
drop policy if exists "Service role manages neighborhoods" on public.neighborhoods;
create policy "Service role manages neighborhoods" on public.neighborhoods
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

grant all on table public.neighborhoods to anon, authenticated, service_role;

-- 4. v_kcmo_neighborhoods: security_invoker view aggregating venue stats per neighborhood.
create or replace view public.v_kcmo_neighborhoods with (security_invoker = true) as
  with venue_stats as (
    select v.neighborhood, v.city, v.state,
      count(*) as venue_count,
      count(*) filter (where v.status = 'published') as published_count,
      count(*) filter (where v.status = 'draft') as draft_count,
      avg(v.lat) filter (where v.lat is not null) as centroid_lat,
      avg(v.lng) filter (where v.lng is not null) as centroid_lng
    from public.venues v
    where v.neighborhood is not null and v.status = any (array['published','draft'])
    group by v.neighborhood, v.city, v.state
  ),
  ownership_stats as (
    select v.neighborhood, v.city, v.state,
      count(distinct v.id) filter (where at.slug = 'black-owned')    as black_owned_count,
      count(distinct v.id) filter (where at.slug = 'women-owned')    as women_owned_count,
      count(distinct v.id) filter (where at.slug = 'veteran-owned')  as veteran_owned_count,
      count(distinct v.id) filter (where at.slug = 'lgbtq-owned')    as lgbtq_owned_count
    from public.venues v
      left join public.venue_tags vt on vt.venue_id = v.id
      left join public.approved_tags at on at.id = vt.tag_id and at.category = 'feature'
    where v.neighborhood is not null and v.status = any (array['published','draft'])
    group by v.neighborhood, v.city, v.state
  )
  select n.slug, n.label, n.tier, n.city, n.state, n.parent_slug, n.sort_order, n.description,
    coalesce(vs.venue_count, 0::bigint) as venue_count,
    coalesce(vs.published_count, 0::bigint) as published_count,
    coalesce(vs.draft_count, 0::bigint) as draft_count,
    coalesce(os.black_owned_count, 0::bigint) as black_owned_count,
    coalesce(os.women_owned_count, 0::bigint) as women_owned_count,
    coalesce(os.veteran_owned_count, 0::bigint) as veteran_owned_count,
    coalesce(os.lgbtq_owned_count, 0::bigint) as lgbtq_owned_count,
    vs.centroid_lat, vs.centroid_lng
  from public.neighborhoods n
    left join venue_stats vs on vs.neighborhood = n.slug and vs.city = n.city and vs.state = n.state
    left join ownership_stats os on os.neighborhood = n.slug and os.city = n.city and os.state = n.state
  where n.is_active
  order by n.tier, n.sort_order, n.label;

grant all on table public.v_kcmo_neighborhoods to anon, authenticated, service_role;
