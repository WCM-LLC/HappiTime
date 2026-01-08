-- Add role-based access controls, invitations, and per-venue assignments.

-- Expand org member roles and store email for easier admin UI.
alter table public.org_members
  add column if not exists email text;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'org_members'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%';

  if constraint_name is not null then
    execute format('alter table public.org_members drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.org_members
  add constraint org_members_role_check
  check (role in ('owner','manager','host','admin','editor','viewer'));

-- Per-venue assignments for managers/hosts.
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

-- Email invitations for org access.
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

-- ---------- RLS helpers ----------
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql stable
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
alter table public.menu_sections enable row level security;
alter table public.menu_items enable row level security;
alter table public.happy_hour_window_menus enable row level security;
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
drop policy if exists "menus_select_member" on public.menus;
create policy "menus_select_access"
on public.menus
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

drop policy if exists "menus_insert_member" on public.menus;
create policy "menus_insert_owner_or_manager"
on public.menus
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

drop policy if exists "menus_update_member" on public.menus;
create policy "menus_update_owner_or_manager"
on public.menus
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

drop policy if exists "menus_delete_member" on public.menus;
create policy "menus_delete_owner_or_manager"
on public.menus
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

-- Menu sections: owner or assigned manager can edit; assigned hosts can view
drop policy if exists "menu_sections_select_member" on public.menu_sections;
create policy "menu_sections_select_access"
on public.menu_sections
for select
to authenticated
using (
  exists (
    select 1
    from public.menus mn
    join public.venues v on v.id = mn.venue_id
    where mn.id = menu_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "menu_sections_insert_member" on public.menu_sections;
create policy "menu_sections_insert_owner_or_manager"
on public.menu_sections
for insert
to authenticated
with check (
  exists (
    select 1
    from public.menus mn
    join public.venues v on v.id = mn.venue_id
    where mn.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_sections_update_member" on public.menu_sections;
create policy "menu_sections_update_owner_or_manager"
on public.menu_sections
for update
to authenticated
using (
  exists (
    select 1
    from public.menus mn
    join public.venues v on v.id = mn.venue_id
    where mn.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
)
with check (
  exists (
    select 1
    from public.menus mn
    join public.venues v on v.id = mn.venue_id
    where mn.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_sections_delete_member" on public.menu_sections;
create policy "menu_sections_delete_owner_or_manager"
on public.menu_sections
for delete
to authenticated
using (
  exists (
    select 1
    from public.menus mn
    join public.venues v on v.id = mn.venue_id
    where mn.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

-- Menu items: owners/managers/hosts assigned to venue can edit
drop policy if exists "menu_items_select_member" on public.menu_items;
create policy "menu_items_select_access"
on public.menu_items
for select
to authenticated
using (
  exists (
    select 1
    from public.menu_sections s
    join public.menus mn on mn.id = s.menu_id
    join public.venues v on v.id = mn.venue_id
    where s.id = section_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "menu_items_insert_member" on public.menu_items;
create policy "menu_items_insert_owner_manager_host"
on public.menu_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.menu_sections s
    join public.menus mn on mn.id = s.menu_id
    join public.venues v on v.id = mn.venue_id
    where s.id = section_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_items_update_member" on public.menu_items;
create policy "menu_items_update_owner_manager_host"
on public.menu_items
for update
to authenticated
using (
  exists (
    select 1
    from public.menu_sections s
    join public.menus mn on mn.id = s.menu_id
    join public.venues v on v.id = mn.venue_id
    where s.id = section_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
)
with check (
  exists (
    select 1
    from public.menu_sections s
    join public.menus mn on mn.id = s.menu_id
    join public.venues v on v.id = mn.venue_id
    where s.id = section_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_items_delete_member" on public.menu_items;
create policy "menu_items_delete_owner_manager_host"
on public.menu_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.menu_sections s
    join public.menus mn on mn.id = s.menu_id
    join public.venues v on v.id = mn.venue_id
    where s.id = section_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

-- Media assets: owner or assigned manager can edit; assigned hosts can view
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'media_assets'
  ) then
    execute 'alter table public.media_assets enable row level security';

    execute 'drop policy if exists "media_assets_select_member" on public.media_assets';
    execute 'create policy "media_assets_select_access"
             on public.media_assets
             for select
             to authenticated
             using (
               exists (
                 select 1
                 from public.venues v
                 where v.id = venue_id
                   and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
               )
             )';

    execute 'drop policy if exists "media_assets_insert_member" on public.media_assets';
    execute 'create policy "media_assets_insert_owner_or_manager"
             on public.media_assets
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
             )';

    execute 'drop policy if exists "media_assets_update_member" on public.media_assets';
    execute 'create policy "media_assets_update_owner_or_manager"
             on public.media_assets
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
             )';

    execute 'drop policy if exists "media_assets_delete_member" on public.media_assets';
    execute 'create policy "media_assets_delete_owner_or_manager"
             on public.media_assets
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
             )';
  end if;
end $$;

-- Events: owner or assigned manager can read
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'events'
  ) then
    execute 'alter table public.events enable row level security';
    execute 'drop policy if exists "events_select_member" on public.events';
    execute 'create policy "events_select_owner_or_manager"
             on public.events
             for select
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
             )';
  end if;
end $$;

-- Happy hour window menus: owner or assigned manager can edit; assigned hosts can view
drop policy if exists "happy_hour_window_menus_select_member" on public.happy_hour_window_menus;
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

drop policy if exists "happy_hour_window_menus_insert_member" on public.happy_hour_window_menus;
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

drop policy if exists "happy_hour_window_menus_update_member" on public.happy_hour_window_menus;
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

drop policy if exists "happy_hour_window_menus_delete_member" on public.happy_hour_window_menus;
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
