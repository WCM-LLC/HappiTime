-- HappiTime core schema (public) + compatibility views.
-- Safe/idempotent: uses IF NOT EXISTS and additive ALTERs where practical.

create extension if not exists "pgcrypto";

-- ---------- Timestamp helpers ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Organizations + roles ----------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid,
  add column if not exists slug text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists organizations_slug_unique
  on public.organizations (slug);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'host'
    check (role in ('owner','manager','host','admin','editor','viewer')),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.org_members
  add column if not exists email text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists org_members_org_user_idx
  on public.org_members (org_id, user_id);

-- ---------- Venues ----------
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  org_name text,
  app_name_preference text not null default 'org' check (app_name_preference in ('org','venue')),
  address text,
  neighborhood text,
  city text,
  state text,
  zip text,
  timezone text not null default 'America/Chicago',
  lat double precision,
  lng double precision,
  phone text,
  website text,
  price_tier int,
  tags text[] not null default '{}'::text[],
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.venues
  add column if not exists org_name text,
  add column if not exists app_name_preference text not null default 'org',
  add column if not exists neighborhood text,
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists price_tier int,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists status text not null default 'draft',
  add column if not exists published_at timestamptz,
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists venues_org_id_idx on public.venues (org_id);
create index if not exists venues_status_idx on public.venues (status);
create index if not exists venues_published_at_idx on public.venues (published_at);

-- Backfill denormalized org_name for existing rows.
update public.venues v
set org_name = o.name
from public.organizations o
where v.org_id = o.id
  and (v.org_name is null or btrim(v.org_name) = '');

-- ---------- Venue assignments ----------
create table if not exists public.venue_members (
  venue_id uuid not null references public.venues(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

alter table public.venue_members
  add column if not exists updated_at timestamptz not null default now();

create index if not exists venue_members_org_user_idx
  on public.venue_members (org_id, user_id);
create index if not exists venue_members_venue_idx
  on public.venue_members (venue_id);

-- ---------- Invites ----------
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager','host')),
  venue_ids uuid[] not null default '{}'::uuid[],
  token uuid not null unique,
  invited_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

alter table public.org_invites
  add column if not exists updated_at timestamptz not null default now();

create index if not exists org_invites_org_id_idx on public.org_invites (org_id);
create index if not exists org_invites_email_idx on public.org_invites (email);

-- ---------- Happy hour windows + offers ----------
create table if not exists public.happy_hour_windows (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  dow int[] not null default '{0}'::int[],
  start_time time not null,
  end_time time not null,
  timezone text not null default 'America/Chicago',
  status text not null default 'draft' check (status in ('draft','published')),
  label text,
  restaurant_id text,
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.happy_hour_windows
  add column if not exists dow int[] not null default '{0}'::int[],
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists status text not null default 'draft',
  add column if not exists label text,
  add column if not exists restaurant_id text,
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Migrate legacy rows (public.happy_hours -> public.happy_hour_windows).
do $$
declare
  has_timezone boolean;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'happy_hours'
  ) then
    if (select count(*) from public.happy_hour_windows) = 0 then
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'happy_hours'
          and column_name = 'timezone'
      ) into has_timezone;

      if has_timezone then
        insert into public.happy_hour_windows (
          venue_id,
          dow,
          start_time,
          end_time,
          timezone,
          status,
          label
        )
        select
          venue_id,
          array[dow]::int[],
          start_time,
          end_time,
          coalesce(timezone, 'America/Chicago'),
          'published',
          label
        from public.happy_hours;
      else
        insert into public.happy_hour_windows (
          venue_id,
          dow,
          start_time,
          end_time,
          timezone,
          status,
          label
        )
        select
          venue_id,
          array[dow]::int[],
          start_time,
          end_time,
          'America/Chicago',
          'published',
          label
        from public.happy_hours;
      end if;
    end if;
  end if;
end $$;

create index if not exists happy_hour_windows_venue_id_idx
  on public.happy_hour_windows (venue_id);
create index if not exists happy_hour_windows_status_idx
  on public.happy_hour_windows (status);

create table if not exists public.happy_hour_offers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  window_id uuid references public.happy_hour_windows(id) on delete set null,
  category text not null,
  title text,
  description text not null,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.happy_hour_offers
  add column if not exists updated_at timestamptz not null default now();

create index if not exists happy_hour_offers_venue_id_idx
  on public.happy_hour_offers (venue_id);
create index if not exists happy_hour_offers_window_id_idx
  on public.happy_hour_offers (window_id);
create index if not exists happy_hour_offers_status_idx
  on public.happy_hour_offers (status);

-- ---------- Menus ----------
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','published')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menus
  add column if not exists status text not null default 'draft',
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists menus_venue_id_idx on public.menus (venue_id);
create index if not exists menus_status_idx on public.menus (status);
create index if not exists menus_active_idx on public.menus (is_active);

create table if not exists public.menu_sections (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_sections
  add column if not exists sort_order int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists menu_sections_menu_id_idx on public.menu_sections (menu_id);
create index if not exists menu_sections_sort_order_idx on public.menu_sections (menu_id, sort_order);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.menu_sections(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2),
  is_happy_hour boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_items
  add column if not exists is_happy_hour boolean not null default false,
  add column if not exists sort_order int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists menu_items_section_id_idx on public.menu_items (section_id);
create index if not exists menu_items_sort_order_idx on public.menu_items (section_id, sort_order);
create index if not exists menu_items_happy_hour_idx on public.menu_items (section_id, is_happy_hour);

-- Link menus to happy hour windows.
create table if not exists public.happy_hour_window_menus (
  happy_hour_window_id uuid not null references public.happy_hour_windows(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (happy_hour_window_id, menu_id)
);

alter table public.happy_hour_window_menus
  add column if not exists updated_at timestamptz not null default now();

-- ---------- Media ----------
create table if not exists public.venue_media (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  type text not null check (type in ('image','video','menu_pdf')),
  status text not null default 'published' check (status in ('draft','published','archived')),
  title text,
  caption text,
  storage_bucket text not null default 'venue-media',
  storage_path text not null,
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venue_media_venue_id_idx on public.venue_media (venue_id);
create index if not exists venue_media_status_idx on public.venue_media (status);

-- Migrate legacy media_assets -> venue_media (best-effort, preserves ids).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'media_assets'
  ) then
    insert into public.venue_media (
      id,
      venue_id,
      type,
      status,
      title,
      storage_bucket,
      storage_path,
      sort_order,
      created_at,
      updated_at
    )
    select
      id,
      venue_id,
      type,
      'published',
      title,
      'venue-media',
      storage_path,
      0,
      created_at,
      coalesce(created_at, now())
    from public.media_assets
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------- Analytics events ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists events_org_venue_type_idx on public.events (org_id, venue_id, event_type);
create index if not exists events_occurred_at_idx on public.events (occurred_at);

create or replace view public.venue_event_counts as
select
  org_id,
  venue_id,
  event_type,
  count(*)::int as cnt
from public.events
group by org_id, venue_id, event_type;

-- ---------- Public discovery dataset ----------
create table if not exists public.happy_hour_places (
  id bigserial primary key,
  name text not null,
  status text not null default 'draft',
  happy_days text[] not null default '{}'::text[],
  start_time time,
  end_time time,
  deal_description text,
  cuisine_type text,
  average_price numeric,
  distance_miles numeric,
  address text,
  neighborhood text,
  venue_name text,
  venue_city text,
  venue_state text,
  venue_zip text,
  org_name text,
  org_slug text,
  phone text,
  rating numeric,
  opening_hours text,
  website_url text,
  business_url text,
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists happy_hour_places_status_idx on public.happy_hour_places (status);
create index if not exists happy_hour_places_org_slug_idx on public.happy_hour_places (org_slug);

-- Optional staging table for imports.
create table if not exists public.notion_venue_import (
  "Name" text,
  "Address" text,
  "Phone Number" text,
  "Website URL" text,
  "Business URL" text,
  "Rating" numeric,
  "Opening Hours" text,
  "Happy Hour Details" text,
  "Happy Hour Category" text
);

-- ---------- Compatibility views ----------
create or replace view public.published_happy_hour_windows as
select *
from public.happy_hour_windows
where status = 'published';

create or replace view public.published_happy_hour_windows_with_names as
select
  phhw.*,
  o.name as organization_name,
  v.name as venue_name
from public.published_happy_hour_windows phhw
left join public.venues v on v.id = phhw.venue_id
left join public.organizations o on o.id = v.org_id;

-- ---------- Diagnostics ----------
create or replace function public.whoami()
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'claims', auth.jwt()
  );
$$;
