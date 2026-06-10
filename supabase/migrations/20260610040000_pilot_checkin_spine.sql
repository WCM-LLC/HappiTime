-- Pilot check-in spine: per-venue secrets + three new tables for check-ins,
-- round redemptions, and staff-reported flags.
--
-- Writes to checkins/round_redemptions happen ONLY via service-role edge
-- functions (bypassing RLS). SELECT policies allow:
--   • checkins / round_redemptions: the row owner OR any org member of the venue's org
--   • venue_flags: any org member of the venue's org (no self-ownership concept)
--
-- Pattern matches venue_attribution_events (same inline-join predicate).

-- ── venues: pilot columns ────────────────────────────────────────────────────
alter table public.venues
  add column if not exists checkin_secret uuid not null default gen_random_uuid(),
  add column if not exists staff_token uuid not null default gen_random_uuid(),
  add column if not exists geofence_radius_m integer not null default 100;

-- ── checkins ─────────────────────────────────────────────────────────────────
create table if not exists public.checkins (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  venue_id     uuid        not null references public.venues(id) on delete cascade,
  method       text        not null check (method in ('code','gps_fallback')),
  service_date date        not null,
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now(),
  unique (user_id, venue_id, service_date)
);
create index if not exists checkins_venue_date_idx on public.checkins (venue_id, service_date);
create index if not exists checkins_user_venue_idx on public.checkins (user_id, venue_id);

alter table public.checkins enable row level security;

drop policy if exists "checkins_select_self_or_org" on public.checkins;
create policy "checkins_select_self_or_org"
  on public.checkins for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.venues v
      join public.org_members om on om.org_id = v.org_id
      where v.id = checkins.venue_id
        and om.user_id = auth.uid()
    )
  );

grant select on public.checkins to authenticated;

-- ── round_redemptions ────────────────────────────────────────────────────────
create table if not exists public.round_redemptions (
  id                  uuid    primary key default gen_random_uuid(),
  user_id             uuid    not null references auth.users(id),
  venue_id            uuid    not null references public.venues(id),
  checkins_consumed   int     not null default 5,
  confirmed_with_code boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists round_redemptions_user_venue_idx
  on public.round_redemptions (user_id, venue_id);

alter table public.round_redemptions enable row level security;

drop policy if exists "round_redemptions_select_self_or_org" on public.round_redemptions;
create policy "round_redemptions_select_self_or_org"
  on public.round_redemptions for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.venues v
      join public.org_members om on om.org_id = v.org_id
      where v.id = round_redemptions.venue_id
        and om.user_id = auth.uid()
    )
  );

grant select on public.round_redemptions to authenticated;

-- ── venue_flags ──────────────────────────────────────────────────────────────
create table if not exists public.venue_flags (
  id          uuid        primary key default gen_random_uuid(),
  venue_id    uuid        not null references public.venues(id),
  flag_type   text        not null check (flag_type in ('staff_code_unknown','abuse_suspected')),
  meta        jsonb       default '{}',
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.venue_flags enable row level security;

drop policy if exists "venue_flags_select_org" on public.venue_flags;
create policy "venue_flags_select_org"
  on public.venue_flags for select to authenticated
  using (
    exists (
      select 1
      from public.venues v
      join public.org_members om on om.org_id = v.org_id
      where v.id = venue_flags.venue_id
        and om.user_id = auth.uid()
    )
  );

grant select on public.venue_flags to authenticated;

-- ── DOWN (manual rollback) ───────────────────────────────────────────────────
-- drop table if exists public.venue_flags cascade;
-- drop table if exists public.round_redemptions cascade;
-- drop table if exists public.checkins cascade;
-- alter table public.venues
--   drop column if exists checkin_secret,
--   drop column if exists staff_token,
--   drop column if exists geofence_radius_m;
