-- Add organization-scoped menu templates that can be copied into venues.
-- Venue copies keep source_menu_id so venue-level edits stay local.

alter table public.menus
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists source_menu_id uuid references public.menus(id) on delete set null,
  add column if not exists scope text not null default 'venue';

alter table public.menus
  alter column venue_id drop not null;

update public.menus m
set org_id = v.org_id,
    scope = 'venue'
from public.venues v
where m.venue_id = v.id
  and m.org_id is null;

update public.menus
set scope = 'venue'
where scope is null;

alter table public.menus
  alter column org_id set not null;

alter table public.menus
  drop constraint if exists menus_scope_check,
  drop constraint if exists menus_scope_parent_check;

alter table public.menus
  add constraint menus_scope_check
    check (scope in ('venue', 'organization')),
  add constraint menus_scope_parent_check
    check (
      (
        scope = 'organization'
        and venue_id is null
        and source_menu_id is null
      )
      or (
        scope = 'venue'
        and venue_id is not null
      )
    );

create index if not exists menus_org_id_idx on public.menus (org_id);
create index if not exists menus_scope_idx on public.menus (scope);
create index if not exists menus_source_menu_id_idx on public.menus (source_menu_id);

create or replace function public.validate_menu_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org_id uuid;
  v_source_scope text;
  v_source_org_id uuid;
begin
  if new.scope = 'venue' then
    if new.venue_id is null then
      raise exception 'venue-scoped menus require venue_id';
    end if;

    select org_id into v_org_id
    from public.venues
    where id = new.venue_id;

    if v_org_id is null then
      raise exception 'venue-scoped menus require a valid venue_id';
    end if;

    if new.org_id is null then
      new.org_id := v_org_id;
    elsif new.org_id <> v_org_id then
      raise exception 'menu org_id must match venue org_id';
    end if;

    if new.source_menu_id is not null then
      select scope, org_id into v_source_scope, v_source_org_id
      from public.menus
      where id = new.source_menu_id;

      if v_source_scope is distinct from 'organization'
         or v_source_org_id is distinct from new.org_id then
        raise exception 'source_menu_id must reference an organization menu in the same organization';
      end if;
    end if;
  elsif new.scope = 'organization' then
    if new.org_id is null then
      raise exception 'organization-scoped menus require org_id';
    end if;

    if new.venue_id is not null or new.source_menu_id is not null then
      raise exception 'organization-scoped menus cannot have venue_id or source_menu_id';
    end if;
  else
    raise exception 'invalid menu scope: %', new.scope;
  end if;

  return new;
end;
$$;

drop trigger if exists menus_validate_scope on public.menus;
create trigger menus_validate_scope
before insert or update of scope, venue_id, org_id, source_menu_id
on public.menus
for each row execute function public.validate_menu_scope();

-- ---------- Menus ----------
drop policy if exists "menus_select_access" on public.menus;
create policy "menus_select_access"
on public.menus
for select
to authenticated
using (
  (
    scope = 'organization'
    and (
      public.is_org_owner(org_id)
      or public.is_org_manager(org_id)
    )
  )
  or (
    scope = 'venue'
    and exists (
    select 1
    from public.venues v
    where v.id = venue_id
      and (
        public.is_org_owner(v.org_id)
        or public.has_venue_assignment(v.id)
      )
    )
  )
);

drop policy if exists "menus_select_public" on public.menus;
create policy "menus_select_public"
on public.menus
for select
to public
using (
  scope = 'venue'
  and status = 'published'
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
  (
    scope = 'organization'
    and (
      public.is_org_owner(org_id)
      or public.is_org_manager(org_id)
    )
  )
  or (
    scope = 'venue'
    and exists (
      select 1
      from public.venues v
      where v.id = venue_id
        and v.org_id = org_id
        and (
          public.is_org_owner(v.org_id)
          or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        )
    )
  )
);

drop policy if exists "menus_update_owner_or_manager" on public.menus;
create policy "menus_update_owner_or_manager"
on public.menus
for update
to authenticated
using (
  (
    scope = 'organization'
    and (
      public.is_org_owner(org_id)
      or public.is_org_manager(org_id)
    )
  )
  or (
    scope = 'venue'
    and exists (
      select 1
      from public.venues v
      where v.id = venue_id
        and v.org_id = org_id
        and (
          public.is_org_owner(v.org_id)
          or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        )
    )
  )
)
with check (
  (
    scope = 'organization'
    and (
      public.is_org_owner(org_id)
      or public.is_org_manager(org_id)
    )
  )
  or (
    scope = 'venue'
    and exists (
      select 1
      from public.venues v
      where v.id = venue_id
        and v.org_id = org_id
        and (
          public.is_org_owner(v.org_id)
          or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        )
    )
  )
);

drop policy if exists "menus_delete_owner_or_manager" on public.menus;
create policy "menus_delete_owner_or_manager"
on public.menus
for delete
to authenticated
using (
  (
    scope = 'organization'
    and (
      public.is_org_owner(org_id)
      or public.is_org_manager(org_id)
    )
  )
  or (
    scope = 'venue'
    and exists (
      select 1
      from public.venues v
      where v.id = venue_id
        and v.org_id = org_id
        and (
          public.is_org_owner(v.org_id)
          or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
        )
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
    left join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or public.has_venue_assignment(v.id)
          )
        )
      )
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
      and m.scope = 'venue'
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
    left join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or (public.is_org_manager(m.org_id) and public.has_venue_assignment(v.id))
            or (public.is_org_host(m.org_id) and public.has_venue_assignment(v.id))
          )
        )
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
    left join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or (public.is_org_manager(m.org_id) and public.has_venue_assignment(v.id))
            or (public.is_org_host(m.org_id) and public.has_venue_assignment(v.id))
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.menus m
    left join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or (public.is_org_manager(m.org_id) and public.has_venue_assignment(v.id))
            or (public.is_org_host(m.org_id) and public.has_venue_assignment(v.id))
          )
        )
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
    left join public.venues v on v.id = m.venue_id
    where m.id = menu_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or (public.is_org_manager(m.org_id) and public.has_venue_assignment(v.id))
            or (public.is_org_host(m.org_id) and public.has_venue_assignment(v.id))
          )
        )
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
    left join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or public.has_venue_assignment(v.id)
          )
        )
      )
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
      and m.scope = 'venue'
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
    left join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or (public.is_org_manager(m.org_id) and public.has_venue_assignment(v.id))
            or (public.is_org_host(m.org_id) and public.has_venue_assignment(v.id))
          )
        )
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
    left join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or (public.is_org_manager(m.org_id) and public.has_venue_assignment(v.id))
            or (public.is_org_host(m.org_id) and public.has_venue_assignment(v.id))
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.menu_sections s
    join public.menus m on m.id = s.menu_id
    left join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or (public.is_org_manager(m.org_id) and public.has_venue_assignment(v.id))
            or (public.is_org_host(m.org_id) and public.has_venue_assignment(v.id))
          )
        )
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
    left join public.venues v on v.id = m.venue_id
    where s.id = section_id
      and (
        (
          m.scope = 'organization'
          and (
            public.is_org_owner(m.org_id)
            or public.is_org_manager(m.org_id)
          )
        )
        or (
          m.scope = 'venue'
          and (
            public.is_org_owner(m.org_id)
            or (public.is_org_manager(m.org_id) and public.has_venue_assignment(v.id))
            or (public.is_org_host(m.org_id) and public.has_venue_assignment(v.id))
          )
        )
      )
  )
);

revoke all on function public.validate_menu_scope() from public;
notify pgrst, 'reload schema';
