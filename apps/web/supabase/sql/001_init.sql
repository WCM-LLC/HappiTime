-- HappyHour Client Portal schema (public)
-- Run this in Supabase SQL editor.

create extension if not exists "pgcrypto";

-- Organizations (multi-location groups)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'host' check (role in ('owner','manager','host','admin','editor','viewer')),
  email text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Per-venue assignments for managers/hosts
create table if not exists public.venue_members (
  venue_id uuid not null references public.venues(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

create index if not exists venue_members_org_user_idx
  on public.venue_members (org_id, user_id);

create index if not exists venue_members_venue_idx
  on public.venue_members (venue_id);

-- Email invitations for org access
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager','host')),
  venue_ids uuid[] not null default '{}'::uuid[],
  token uuid not null unique,
  invited_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

create index if not exists org_invites_org_id_idx
  on public.org_invites (org_id);

create index if not exists org_invites_email_idx
  on public.org_invites (email);
-- Venues / locations
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  app_name_preference text not null default 'org',
  address text,
  city text,
  state text,
  zip text,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);

-- Happy hour time windows (multi-day arrays)
create table if not exists public.happy_hour_windows (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  dow int[] not null,
  start_time time not null,
  end_time time not null,
  timezone text not null default 'America/Chicago',
  status text not null default 'draft' check (status in ('draft','published')),
  label text,
  created_at timestamptz not null default now()
);

-- Structured menus
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,   
  venue_id uuid not null references public.venues(id) on delete cascade,        
  name text not null,
  status text not null default 'draft',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Link menus to happy hour windows
create table if not exists public.happy_hour_window_menus (
  happy_hour_window_id uuid not null references public.happy_hour_windows(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (happy_hour_window_id, menu_id)
);

create table if not exists public.menu_sections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,   
  venue_id uuid not null references public.venues(id) on delete cascade,        
  menu_id uuid not null references public.menus(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  section_id uuid not null references public.menu_sections(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2),
  is_happy_hour boolean not null default false,
  sort_order int not null default 0,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Media metadata (actual files live in Storage bucket)
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  type text not null check (type in ('image','video','menu_pdf')),
  title text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- User-app analytics events
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

create or replace view public.venue_event_counts as
select
  org_id,
  venue_id,
  event_type,
  count(*)::bigint as cnt
from public.events
group by org_id, venue_id, event_type;

drop view if exists public.published_happy_hour_windows_with_names;
drop view if exists public.published_happy_hour_windows;

create view public.published_happy_hour_windows as
select *
from public.happy_hour_windows
where status = 'published';

create view public.published_happy_hour_windows_with_names as
select
  phhw.*,
  o.name as organization_name,
  v.name as venue_name
from public.published_happy_hour_windows phhw
left join public.venues v on v.id = phhw.venue_id
left join public.organizations o on o.id = v.org_id;

-- ---------- RLS helpers ----------
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_owner(p_org_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.is_org_manager(p_org_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('manager','admin','editor')
  );
$$;

create or replace function public.is_org_host(p_org_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role = 'host'
  );
$$;

create or replace function public.has_venue_assignment(p_venue_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = p_venue_id
      and vm.user_id = auth.uid()
  );
$$;

-- ---------- Enable RLS ----------
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.venues enable row level security;
alter table public.happy_hour_windows enable row level security;
alter table public.menus enable row level security;
alter table public.happy_hour_window_menus enable row level security;
alter table public.menu_sections enable row level security;
alter table public.menu_items enable row level security;
alter table public.media_assets enable row level security;
alter table public.events enable row level security;
alter table public.venue_members enable row level security;
alter table public.org_invites enable row level security;

-- ---------- Policies ----------
-- Organizations: members can read; owners can update/delete
drop policy if exists "org_select_members" on public.organizations;
create policy "org_select_members"
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists "org_insert_self" on public.organizations;
create policy "org_insert_self"
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "org_update_owner" on public.organizations;
create policy "org_update_owner"
on public.organizations
for update
to authenticated
using (public.is_org_owner(id))
with check (public.is_org_owner(id));

drop policy if exists "org_delete_owner" on public.organizations;
create policy "org_delete_owner"
on public.organizations
for delete
to authenticated
using (public.is_org_owner(id));

-- Org members: self can read own row; owners can read/manage all
drop policy if exists "org_members_select" on public.org_members;
create policy "org_members_select"
on public.org_members
for select
to authenticated
using (user_id = auth.uid() or public.is_org_owner(org_id));

drop policy if exists "org_members_insert_creator_only" on public.org_members;
create policy "org_members_insert_creator_or_owner"
on public.org_members
for insert
to authenticated
with check (
  exists (
    select 1 from public.organizations o
    where o.id = org_id
      and o.created_by = auth.uid()
  )
  or public.is_org_owner(org_id)
);

drop policy if exists "org_members_update_owner" on public.org_members;
create policy "org_members_update_owner"
on public.org_members
for update
to authenticated
using (public.is_org_owner(org_id))
with check (public.is_org_owner(org_id));

drop policy if exists "org_members_delete_owner" on public.org_members;
create policy "org_members_delete_owner"
on public.org_members
for delete
to authenticated
using (public.is_org_owner(org_id));

-- Venue assignments: self or owner can read; only owners can manage
drop policy if exists "venue_members_select" on public.venue_members;
create policy "venue_members_select"
on public.venue_members
for select
to authenticated
using (user_id = auth.uid() or public.is_org_owner(org_id));

drop policy if exists "venue_members_insert_owner" on public.venue_members;
create policy "venue_members_insert_owner"
on public.venue_members
for insert
to authenticated
with check (public.is_org_owner(org_id));

drop policy if exists "venue_members_update_owner" on public.venue_members;
create policy "venue_members_update_owner"
on public.venue_members
for update
to authenticated
using (public.is_org_owner(org_id))
with check (public.is_org_owner(org_id));

drop policy if exists "venue_members_delete_owner" on public.venue_members;
create policy "venue_members_delete_owner"
on public.venue_members
for delete
to authenticated
using (public.is_org_owner(org_id));

-- Invites: owners only
drop policy if exists "org_invites_owner_all" on public.org_invites;
create policy "org_invites_owner_all"
on public.org_invites
for all
to authenticated
using (public.is_org_owner(org_id))
with check (public.is_org_owner(org_id));

-- Venues: owners see all; managers/hosts see assigned venues; only owners/managers can edit
drop policy if exists "venues_select_member" on public.venues;
create policy "venues_select_access"
on public.venues
for select
to authenticated
using (public.is_org_owner(org_id) or public.has_venue_assignment(id));

drop policy if exists "venues_insert_member" on public.venues;
create policy "venues_insert_owner"
on public.venues
for insert
to authenticated
with check (public.is_org_owner(org_id));

drop policy if exists "venues_update_member" on public.venues;
create policy "venues_update_owner_or_manager"
on public.venues
for update
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(id))
)
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(id))
);

drop policy if exists "venues_delete_member" on public.venues;
create policy "venues_delete_owner"
on public.venues
for delete
to authenticated
using (public.is_org_owner(org_id));

-- Happy hour windows: owner or assigned manager can edit; assigned hosts can view
drop policy if exists "happy_hour_windows_select_access" on public.happy_hour_windows;
create policy "happy_hour_windows_select_access"
on public.happy_hour_windows
for select
to authenticated
using (
  exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "happy_hour_windows_insert_owner_or_manager" on public.happy_hour_windows;
create policy "happy_hour_windows_insert_owner_or_manager"
on public.happy_hour_windows
for insert
to authenticated
with check (
  exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_windows_update_owner_or_manager" on public.happy_hour_windows;
create policy "happy_hour_windows_update_owner_or_manager"
on public.happy_hour_windows
for update
to authenticated
using (
  exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
)
with check (
  exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_windows_delete_owner_or_manager" on public.happy_hour_windows;
create policy "happy_hour_windows_delete_owner_or_manager"
on public.happy_hour_windows
for delete
to authenticated
using (
  exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

-- Menus: owner or assigned manager can edit; assigned hosts can view
drop policy if exists "menus_select_access" on public.menus;
create policy "menus_select_access"
on public.menus
for select
to authenticated
using (public.is_org_owner(org_id) or public.has_venue_assignment(venue_id));

drop policy if exists "menus_insert_owner_or_manager" on public.menus;
create policy "menus_insert_owner_or_manager"
on public.menus
for insert
to authenticated
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);

drop policy if exists "menus_update_owner_or_manager" on public.menus;
create policy "menus_update_owner_or_manager"
on public.menus
for update
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
)
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);

drop policy if exists "menus_delete_owner_or_manager" on public.menus;
create policy "menus_delete_owner_or_manager"
on public.menus
for delete
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))  
);

-- Happy hour window menus: owner or assigned manager can edit; assigned hosts can view
drop policy if exists "happy_hour_window_menus_select_access" on public.happy_hour_window_menus;
create policy "happy_hour_window_menus_select_access"
on public.happy_hour_window_menus
for select
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "happy_hour_window_menus_insert_owner_or_manager" on public.happy_hour_window_menus;
create policy "happy_hour_window_menus_insert_owner_or_manager"
on public.happy_hour_window_menus
for insert
to authenticated
with check (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.menus mn on mn.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_id
      and mn.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_window_menus_update_owner_or_manager" on public.happy_hour_window_menus;
create policy "happy_hour_window_menus_update_owner_or_manager"
on public.happy_hour_window_menus
for update
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
)
with check (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.menus mn on mn.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_id
      and mn.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_window_menus_delete_owner_or_manager" on public.happy_hour_window_menus;
create policy "happy_hour_window_menus_delete_owner_or_manager"
on public.happy_hour_window_menus
for delete
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

-- Menu sections: owner or assigned manager can edit; assigned hosts can view   
drop policy if exists "menu_sections_select_access" on public.menu_sections;    
create policy "menu_sections_select_access"
on public.menu_sections
for select
to authenticated
using (public.is_org_owner(org_id) or public.has_venue_assignment(venue_id));

drop policy if exists "menu_sections_insert_owner_or_manager" on public.menu_sections;
create policy "menu_sections_insert_owner_or_manager"
on public.menu_sections
for insert
to authenticated
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);

drop policy if exists "menu_sections_update_owner_or_manager" on public.menu_sections;
create policy "menu_sections_update_owner_or_manager"
on public.menu_sections
for update
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
)
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);

drop policy if exists "menu_sections_delete_owner_or_manager" on public.menu_sections;
create policy "menu_sections_delete_owner_or_manager"
on public.menu_sections
for delete
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);

-- Menu items: owners/managers/hosts assigned to venue can edit
drop policy if exists "menu_items_select_access" on public.menu_items;
create policy "menu_items_select_access"
on public.menu_items
for select
to authenticated
using (public.is_org_owner(org_id) or public.has_venue_assignment(venue_id));

drop policy if exists "menu_items_insert_owner_manager_host" on public.menu_items;
create policy "menu_items_insert_owner_manager_host"
on public.menu_items
for insert
to authenticated
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
  or (public.is_org_host(org_id) and public.has_venue_assignment(venue_id))
);

drop policy if exists "menu_items_update_owner_manager_host" on public.menu_items;
create policy "menu_items_update_owner_manager_host"
on public.menu_items
for update
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
  or (public.is_org_host(org_id) and public.has_venue_assignment(venue_id))
)
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
  or (public.is_org_host(org_id) and public.has_venue_assignment(venue_id))
);

drop policy if exists "menu_items_delete_owner_manager_host" on public.menu_items;
create policy "menu_items_delete_owner_manager_host"
on public.menu_items
for delete
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
  or (public.is_org_host(org_id) and public.has_venue_assignment(venue_id))
);

-- Media assets: owner or assigned manager can edit; assigned hosts can view
drop policy if exists "media_assets_select_access" on public.media_assets;
create policy "media_assets_select_access"
on public.media_assets
for select
to authenticated
using (public.is_org_owner(org_id) or public.has_venue_assignment(venue_id));

drop policy if exists "media_assets_insert_owner_or_manager" on public.media_assets;
create policy "media_assets_insert_owner_or_manager"
on public.media_assets
for insert
to authenticated
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);

drop policy if exists "media_assets_update_owner_or_manager" on public.media_assets;
create policy "media_assets_update_owner_or_manager"
on public.media_assets
for update
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
)
with check (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);

drop policy if exists "media_assets_delete_owner_or_manager" on public.media_assets;
create policy "media_assets_delete_owner_or_manager"
on public.media_assets
for delete
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);

-- Events: owner or assigned manager can read
drop policy if exists "events_select_owner_or_manager" on public.events;
create policy "events_select_owner_or_manager"
on public.events
for select
to authenticated
using (
  public.is_org_owner(org_id)
  or (public.is_org_manager(org_id) and public.has_venue_assignment(venue_id))
);
