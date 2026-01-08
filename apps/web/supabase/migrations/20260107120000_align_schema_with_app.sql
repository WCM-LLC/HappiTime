-- Align core tables/views with the app expectations (idempotent).
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'happy_hour_windows'
  ) then
    execute '
      create table public.happy_hour_windows (
        id uuid primary key default gen_random_uuid(),
        venue_id uuid not null references public.venues(id) on delete cascade,
        dow int[] not null,
        start_time time not null,
        end_time time not null,
        timezone text not null default ''America/Chicago'',
        status text not null default ''draft'',
        label text,
        created_at timestamptz not null default now()
      )
    ';
  end if;
end $$;

alter table public.happy_hour_windows
  add column if not exists dow int[] not null default '{0}'::int[],
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists status text not null default 'draft',
  add column if not exists label text;

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
        execute '
          insert into public.happy_hour_windows (venue_id, dow, start_time, end_time, timezone, status, label)
          select
            venue_id,
            array[dow]::int[],
            start_time,
            end_time,
            coalesce(timezone, ''America/Chicago''),
            ''published'',
            label
          from public.happy_hours
        ';
      else
        execute '
          insert into public.happy_hour_windows (venue_id, dow, start_time, end_time, timezone, status, label)
          select
            venue_id,
            array[dow]::int[],
            start_time,
            end_time,
            ''America/Chicago'',
            ''published'',
            label
          from public.happy_hours
        ';
      end if;
    end if;
  end if;
end $$;

alter table public.menus
  add column if not exists status text not null default 'draft';

alter table public.menu_sections
  add column if not exists sort_order int not null default 0;

alter table public.menu_items
  add column if not exists is_happy_hour boolean not null default false,
  add column if not exists sort_order int not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menu_sections'
      and column_name = 'sort'
  ) then
    execute 'update public.menu_sections set sort_order = sort where sort_order = 0 and sort is not null';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menu_items'
      and column_name = 'sort'
  ) then
    execute 'update public.menu_items set sort_order = sort where sort_order = 0 and sort is not null';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'happy_hour_window_menus'
  ) then
    execute '
      create table public.happy_hour_window_menus (
        happy_hour_window_id uuid not null references public.happy_hour_windows(id) on delete cascade,
        menu_id uuid not null references public.menus(id) on delete cascade,
        created_at timestamptz not null default now(),
        primary key (happy_hour_window_id, menu_id)
      )
    ';
  end if;
end $$;

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

alter table public.happy_hour_windows enable row level security;
alter table public.happy_hour_window_menus enable row level security;

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
