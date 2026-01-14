-- Core RLS policies (tenant isolation + public published reads).

-- ---------- Helpers ----------
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
alter table public.venue_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.happy_hour_windows enable row level security;
alter table public.happy_hour_offers enable row level security;
alter table public.menus enable row level security;
alter table public.menu_sections enable row level security;
alter table public.menu_items enable row level security;
alter table public.happy_hour_window_menus enable row level security;
alter table public.venue_media enable row level security;
alter table public.events enable row level security;
alter table public.happy_hour_places enable row level security;

-- ---------- Organizations ----------
drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists "organizations_select_public" on public.organizations;
create policy "organizations_select_public"
on public.organizations
for select
to public
using (
  exists (
    select 1
    from public.venues v
    where v.org_id = id
      and v.status = 'published'
  )
);

drop policy if exists "organizations_insert_authenticated" on public.organizations;
create policy "organizations_insert_authenticated"
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "organizations_update_owner" on public.organizations;
create policy "organizations_update_owner"
on public.organizations
for update
to authenticated
using (public.is_org_owner(id))
with check (public.is_org_owner(id));

drop policy if exists "organizations_delete_owner" on public.organizations;
create policy "organizations_delete_owner"
on public.organizations
for delete
to authenticated
using (public.is_org_owner(id));

-- ---------- Org members ----------
drop policy if exists "org_members_select" on public.org_members;
create policy "org_members_select"
on public.org_members
for select
to authenticated
using (user_id = auth.uid() or public.is_org_owner(org_id));

drop policy if exists "org_members_insert_creator_or_owner" on public.org_members;
create policy "org_members_insert_creator_or_owner"
on public.org_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organizations o
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

-- ---------- Venues ----------
drop policy if exists "venues_select_access" on public.venues;
create policy "venues_select_access"
on public.venues
for select
to authenticated
using (public.is_org_owner(org_id) or public.has_venue_assignment(id));

drop policy if exists "venues_select_public" on public.venues;
create policy "venues_select_public"
on public.venues
for select
to public
using (status = 'published');

drop policy if exists "venues_insert_owner" on public.venues;
create policy "venues_insert_owner"
on public.venues
for insert
to authenticated
with check (public.is_org_owner(org_id));

drop policy if exists "venues_update_owner_or_manager" on public.venues;
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

drop policy if exists "venues_delete_owner" on public.venues;
create policy "venues_delete_owner"
on public.venues
for delete
to authenticated
using (public.is_org_owner(org_id));

-- ---------- Venue members ----------
drop policy if exists "venue_members_select" on public.venue_members;
create policy "venue_members_select"
on public.venue_members
for select
to authenticated
using (public.is_org_owner(org_id) or user_id = auth.uid());

drop policy if exists "venue_members_insert_owner" on public.venue_members;
create policy "venue_members_insert_owner"
on public.venue_members
for insert
to authenticated
with check (public.is_org_owner(org_id));

drop policy if exists "venue_members_delete_owner" on public.venue_members;
create policy "venue_members_delete_owner"
on public.venue_members
for delete
to authenticated
using (public.is_org_owner(org_id));

-- ---------- Org invites ----------
drop policy if exists "org_invites_select_owner" on public.org_invites;
create policy "org_invites_select_owner"
on public.org_invites
for select
to authenticated
using (public.is_org_owner(org_id));

drop policy if exists "org_invites_insert_owner" on public.org_invites;
create policy "org_invites_insert_owner"
on public.org_invites
for insert
to authenticated
with check (public.is_org_owner(org_id));

drop policy if exists "org_invites_update_owner" on public.org_invites;
create policy "org_invites_update_owner"
on public.org_invites
for update
to authenticated
using (public.is_org_owner(org_id))
with check (public.is_org_owner(org_id));

drop policy if exists "org_invites_delete_owner" on public.org_invites;
create policy "org_invites_delete_owner"
on public.org_invites
for delete
to authenticated
using (public.is_org_owner(org_id));

-- ---------- Happy hour windows ----------
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

drop policy if exists "happy_hour_windows_select_public" on public.happy_hour_windows;
create policy "happy_hour_windows_select_public"
on public.happy_hour_windows
for select
to public
using (
  status = 'published'
  and exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and v.status = 'published'
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

-- ---------- Happy hour offers ----------
drop policy if exists "happy_hour_offers_select_access" on public.happy_hour_offers;
create policy "happy_hour_offers_select_access"
on public.happy_hour_offers
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

drop policy if exists "happy_hour_offers_select_public" on public.happy_hour_offers;
create policy "happy_hour_offers_select_public"
on public.happy_hour_offers
for select
to public
using (
  status = 'published'
  and exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and v.status = 'published'
  )
);

drop policy if exists "happy_hour_offers_insert_owner_or_manager" on public.happy_hour_offers;
create policy "happy_hour_offers_insert_owner_or_manager"
on public.happy_hour_offers
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

drop policy if exists "happy_hour_offers_update_owner_or_manager" on public.happy_hour_offers;
create policy "happy_hour_offers_update_owner_or_manager"
on public.happy_hour_offers
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

drop policy if exists "happy_hour_offers_delete_owner_or_manager" on public.happy_hour_offers;
create policy "happy_hour_offers_delete_owner_or_manager"
on public.happy_hour_offers
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

-- ---------- Menus ----------
drop policy if exists "menus_select_access" on public.menus;
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

drop policy if exists "menus_select_public" on public.menus;
create policy "menus_select_public"
on public.menus
for select
to public
using (
  status = 'published'
  and is_active = true
  and exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and v.status = 'published'
  )
);

drop policy if exists "menus_insert_owner_or_manager" on public.menus;
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

drop policy if exists "menus_update_owner_or_manager" on public.menus;
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

drop policy if exists "menus_delete_owner_or_manager" on public.menus;
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

-- ---------- Menu sections ----------
drop policy if exists "menu_sections_select_access" on public.menu_sections;
create policy "menu_sections_select_access"
on public.menu_sections
for select
to authenticated
using (
  exists (
    select 1
    from public.menus m
    join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "menu_sections_select_public" on public.menu_sections;
create policy "menu_sections_select_public"
on public.menu_sections
for select
to public
using (
  exists (
    select 1
    from public.menus m
    join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and m.status = 'published'
      and m.is_active = true
      and v.status = 'published'
  )
);

drop policy if exists "menu_sections_insert_access" on public.menu_sections;
create policy "menu_sections_insert_access"
on public.menu_sections
for insert
to authenticated
with check (
  exists (
    select 1
    from public.menus m
    join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_sections_update_access" on public.menu_sections;
create policy "menu_sections_update_access"
on public.menu_sections
for update
to authenticated
using (
  exists (
    select 1
    from public.menus m
    join public.venues v on v.id = m.venue_id
    where m.id = menu_id
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
    from public.menus m
    join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_sections_delete_access" on public.menu_sections;
create policy "menu_sections_delete_access"
on public.menu_sections
for delete
to authenticated
using (
  exists (
    select 1
    from public.menus m
    join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

-- ---------- Menu items ----------
drop policy if exists "menu_items_select_access" on public.menu_items;
create policy "menu_items_select_access"
on public.menu_items
for select
to authenticated
using (
  exists (
    select 1
    from public.menu_sections s
    join public.menus m on m.id = s.menu_id
    join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "menu_items_select_public" on public.menu_items;
create policy "menu_items_select_public"
on public.menu_items
for select
to public
using (
  exists (
    select 1
    from public.menu_sections s
    join public.menus m on m.id = s.menu_id
    join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and m.status = 'published'
      and m.is_active = true
      and v.status = 'published'
  )
);

drop policy if exists "menu_items_insert_access" on public.menu_items;
create policy "menu_items_insert_access"
on public.menu_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.menu_sections s
    join public.menus m on m.id = s.menu_id
    join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_items_update_access" on public.menu_items;
create policy "menu_items_update_access"
on public.menu_items
for update
to authenticated
using (
  exists (
    select 1
    from public.menu_sections s
    join public.menus m on m.id = s.menu_id
    join public.venues v on v.id = m.venue_id
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
    join public.menus m on m.id = s.menu_id
    join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_items_delete_access" on public.menu_items;
create policy "menu_items_delete_access"
on public.menu_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.menu_sections s
    join public.menus m on m.id = s.menu_id
    join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        or (public.is_org_host(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

-- ---------- Happy hour window menus ----------
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

drop policy if exists "happy_hour_window_menus_select_public" on public.happy_hour_window_menus;
create policy "happy_hour_window_menus_select_public"
on public.happy_hour_window_menus
for select
to public
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.menus m on m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_id
      and m.id = menu_id
      and hw.status = 'published'
      and m.status = 'published'
      and m.is_active = true
      and v.status = 'published'
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
    join public.menus m on m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_id
      and m.id = menu_id
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
    join public.menus m on m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_id
      and m.id = menu_id
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

-- ---------- Venue media ----------
drop policy if exists "venue_media_select_access" on public.venue_media;
create policy "venue_media_select_access"
on public.venue_media
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
);

drop policy if exists "venue_media_select_public" on public.venue_media;
create policy "venue_media_select_public"
on public.venue_media
for select
to public
using (
  status = 'published'
  and exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and v.status = 'published'
  )
);

drop policy if exists "venue_media_insert_owner_or_manager" on public.venue_media;
create policy "venue_media_insert_owner_or_manager"
on public.venue_media
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

drop policy if exists "venue_media_update_owner_or_manager" on public.venue_media;
create policy "venue_media_update_owner_or_manager"
on public.venue_media
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

drop policy if exists "venue_media_delete_owner_or_manager" on public.venue_media;
create policy "venue_media_delete_owner_or_manager"
on public.venue_media
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

-- ---------- Events ----------
drop policy if exists "events_select_owner_or_manager" on public.events;
create policy "events_select_owner_or_manager"
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
);

-- ---------- Happy hour places (public dataset) ----------
drop policy if exists "happy_hour_places_select_public_verified" on public.happy_hour_places;
create policy "happy_hour_places_select_public_verified"
on public.happy_hour_places
for select
to public
using (status = 'verified');

-- ---------- Grants ----------
grant usage on schema public to anon, authenticated;
grant select on public.happy_hour_places to anon, authenticated;
grant select on public.venues to anon, authenticated;
grant select on public.happy_hour_windows to anon, authenticated;
grant select on public.happy_hour_offers to anon, authenticated;
grant select on public.menus to anon, authenticated;
grant select on public.menu_sections to anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant select on public.happy_hour_window_menus to anon, authenticated;
grant select on public.venue_media to anon, authenticated;
grant select on public.organizations to anon, authenticated;
grant select on public.published_happy_hour_windows to anon, authenticated;
grant select on public.published_happy_hour_windows_with_names to anon, authenticated;

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.org_members to authenticated;
grant select, insert, update, delete on public.venues to authenticated;
grant select, insert, update, delete on public.venue_members to authenticated;
grant select, insert, update, delete on public.org_invites to authenticated;
grant select, insert, update, delete on public.happy_hour_windows to authenticated;
grant select, insert, update, delete on public.happy_hour_offers to authenticated;
grant select, insert, update, delete on public.menus to authenticated;
grant select, insert, update, delete on public.menu_sections to authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
grant select, insert, update, delete on public.happy_hour_window_menus to authenticated;
grant select, insert, update, delete on public.venue_media to authenticated;
grant select on public.venue_event_counts to authenticated;
grant select on public.events to authenticated;

-- Service role is used by server-side tasks (invites, event ingestion, etc).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
