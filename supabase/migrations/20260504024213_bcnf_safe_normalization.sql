-- BCNF-safe additive normalization. This migration keeps all legacy contract
-- columns in place while adding normalized tables, backfills, sync triggers,
-- and a transactional RPC for replacing happy-hour window menu links.

create table if not exists public.happy_hour_window_days (
  window_id uuid not null references public.happy_hour_windows(id) on delete cascade,
  dow int not null check (dow between 0 and 6),
  created_at timestamptz not null default now(),
  primary key (window_id, dow)
);

create index if not exists happy_hour_window_days_dow_idx
  on public.happy_hour_window_days (dow);

alter table public.happy_hour_window_days enable row level security;

drop policy if exists "happy_hour_window_days_select_access" on public.happy_hour_window_days;
create policy "happy_hour_window_days_select_access"
on public.happy_hour_window_days
for select
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_days.window_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "happy_hour_window_days_select_public" on public.happy_hour_window_days;
create policy "happy_hour_window_days_select_public"
on public.happy_hour_window_days
for select
to public
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_days.window_id
      and hw.status = 'published'
      and v.status = 'published'
  )
);

drop policy if exists "happy_hour_window_days_insert_owner_or_manager" on public.happy_hour_window_days;
create policy "happy_hour_window_days_insert_owner_or_manager"
on public.happy_hour_window_days
for insert
to authenticated
with check (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_days.window_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_window_days_update_owner_or_manager" on public.happy_hour_window_days;
create policy "happy_hour_window_days_update_owner_or_manager"
on public.happy_hour_window_days
for update
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_days.window_id
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
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_days.window_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_window_days_delete_owner_or_manager" on public.happy_hour_window_days;
create policy "happy_hour_window_days_delete_owner_or_manager"
on public.happy_hour_window_days
for delete
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_window_days.window_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

create table if not exists public.happy_hour_offer_windows (
  offer_id uuid not null references public.happy_hour_offers(id) on delete cascade,
  window_id uuid not null references public.happy_hour_windows(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (offer_id, window_id)
);

create index if not exists happy_hour_offer_windows_window_id_idx
  on public.happy_hour_offer_windows (window_id);

alter table public.happy_hour_offer_windows enable row level security;

drop policy if exists "happy_hour_offer_windows_select_access" on public.happy_hour_offer_windows;
create policy "happy_hour_offer_windows_select_access"
on public.happy_hour_offer_windows
for select
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_offers o
    join public.happy_hour_windows hw on hw.id = happy_hour_offer_windows.window_id
    join public.venues v on v.id = hw.venue_id
    where o.id = happy_hour_offer_windows.offer_id
      and o.venue_id = hw.venue_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "happy_hour_offer_windows_select_public" on public.happy_hour_offer_windows;
create policy "happy_hour_offer_windows_select_public"
on public.happy_hour_offer_windows
for select
to public
using (
  exists (
    select 1
    from public.happy_hour_offers o
    join public.happy_hour_windows hw on hw.id = happy_hour_offer_windows.window_id
    join public.venues v on v.id = hw.venue_id
    where o.id = happy_hour_offer_windows.offer_id
      and o.venue_id = hw.venue_id
      and o.status = 'published'
      and hw.status = 'published'
      and v.status = 'published'
  )
);

drop policy if exists "happy_hour_offer_windows_insert_owner_or_manager" on public.happy_hour_offer_windows;
create policy "happy_hour_offer_windows_insert_owner_or_manager"
on public.happy_hour_offer_windows
for insert
to authenticated
with check (
  exists (
    select 1
    from public.happy_hour_offers o
    join public.happy_hour_windows hw on hw.id = happy_hour_offer_windows.window_id
    join public.venues v on v.id = hw.venue_id
    where o.id = happy_hour_offer_windows.offer_id
      and o.venue_id = hw.venue_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_offer_windows_update_owner_or_manager" on public.happy_hour_offer_windows;
create policy "happy_hour_offer_windows_update_owner_or_manager"
on public.happy_hour_offer_windows
for update
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_offers o
    join public.happy_hour_windows hw on hw.id = happy_hour_offer_windows.window_id
    join public.venues v on v.id = hw.venue_id
    where o.id = happy_hour_offer_windows.offer_id
      and o.venue_id = hw.venue_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
)
with check (
  exists (
    select 1
    from public.happy_hour_offers o
    join public.happy_hour_windows hw on hw.id = happy_hour_offer_windows.window_id
    join public.venues v on v.id = hw.venue_id
    where o.id = happy_hour_offer_windows.offer_id
      and o.venue_id = hw.venue_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_offer_windows_delete_owner_or_manager" on public.happy_hour_offer_windows;
create policy "happy_hour_offer_windows_delete_owner_or_manager"
on public.happy_hour_offer_windows
for delete
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_offers o
    join public.happy_hour_windows hw on hw.id = happy_hour_offer_windows.window_id
    join public.venues v on v.id = hw.venue_id
    where o.id = happy_hour_offer_windows.offer_id
      and o.venue_id = hw.venue_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

create table if not exists public.menu_item_base_prices (
  menu_item_id uuid primary key references public.menu_items(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_item_base_prices enable row level security;

drop policy if exists "menu_item_base_prices_select_access" on public.menu_item_base_prices;
create policy "menu_item_base_prices_select_access"
on public.menu_item_base_prices
for select
to authenticated
using (
  exists (
    select 1
    from public.menu_items mi
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id
    join public.venues v on v.id = m.venue_id
    where mi.id = menu_item_base_prices.menu_item_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "menu_item_base_prices_select_public" on public.menu_item_base_prices;
create policy "menu_item_base_prices_select_public"
on public.menu_item_base_prices
for select
to public
using (
  exists (
    select 1
    from public.menu_items mi
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id
    join public.venues v on v.id = m.venue_id
    where mi.id = menu_item_base_prices.menu_item_id
      and m.status = 'published'
      and m.is_active = true
      and v.status = 'published'
  )
);

drop policy if exists "menu_item_base_prices_insert_owner_or_manager" on public.menu_item_base_prices;
create policy "menu_item_base_prices_insert_owner_or_manager"
on public.menu_item_base_prices
for insert
to authenticated
with check (
  exists (
    select 1
    from public.menu_items mi
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id
    join public.venues v on v.id = m.venue_id
    where mi.id = menu_item_base_prices.menu_item_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_item_base_prices_update_owner_or_manager" on public.menu_item_base_prices;
create policy "menu_item_base_prices_update_owner_or_manager"
on public.menu_item_base_prices
for update
to authenticated
using (
  exists (
    select 1
    from public.menu_items mi
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id
    join public.venues v on v.id = m.venue_id
    where mi.id = menu_item_base_prices.menu_item_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
)
with check (
  exists (
    select 1
    from public.menu_items mi
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id
    join public.venues v on v.id = m.venue_id
    where mi.id = menu_item_base_prices.menu_item_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "menu_item_base_prices_delete_owner_or_manager" on public.menu_item_base_prices;
create policy "menu_item_base_prices_delete_owner_or_manager"
on public.menu_item_base_prices
for delete
to authenticated
using (
  exists (
    select 1
    from public.menu_items mi
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id
    join public.venues v on v.id = m.venue_id
    where mi.id = menu_item_base_prices.menu_item_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

create table if not exists public.happy_hour_menu_item_prices (
  window_id uuid not null references public.happy_hour_windows(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (window_id, menu_item_id)
);

create index if not exists happy_hour_menu_item_prices_menu_item_id_idx
  on public.happy_hour_menu_item_prices (menu_item_id);

alter table public.happy_hour_menu_item_prices enable row level security;

drop policy if exists "happy_hour_menu_item_prices_select_access" on public.happy_hour_menu_item_prices;
create policy "happy_hour_menu_item_prices_select_access"
on public.happy_hour_menu_item_prices
for select
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.menu_items mi on mi.id = happy_hour_menu_item_prices.menu_item_id
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id and m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_menu_item_prices.window_id
      and (public.is_org_owner(v.org_id) or public.has_venue_assignment(v.id))
  )
);

drop policy if exists "happy_hour_menu_item_prices_select_public" on public.happy_hour_menu_item_prices;
create policy "happy_hour_menu_item_prices_select_public"
on public.happy_hour_menu_item_prices
for select
to public
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.menu_items mi on mi.id = happy_hour_menu_item_prices.menu_item_id
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id and m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_menu_item_prices.window_id
      and hw.status = 'published'
      and m.status = 'published'
      and m.is_active = true
      and v.status = 'published'
  )
);

drop policy if exists "happy_hour_menu_item_prices_insert_owner_or_manager" on public.happy_hour_menu_item_prices;
create policy "happy_hour_menu_item_prices_insert_owner_or_manager"
on public.happy_hour_menu_item_prices
for insert
to authenticated
with check (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.menu_items mi on mi.id = happy_hour_menu_item_prices.menu_item_id
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id and m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_menu_item_prices.window_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_menu_item_prices_update_owner_or_manager" on public.happy_hour_menu_item_prices;
create policy "happy_hour_menu_item_prices_update_owner_or_manager"
on public.happy_hour_menu_item_prices
for update
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.menu_items mi on mi.id = happy_hour_menu_item_prices.menu_item_id
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id and m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_menu_item_prices.window_id
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
    join public.menu_items mi on mi.id = happy_hour_menu_item_prices.menu_item_id
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id and m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_menu_item_prices.window_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

drop policy if exists "happy_hour_menu_item_prices_delete_owner_or_manager" on public.happy_hour_menu_item_prices;
create policy "happy_hour_menu_item_prices_delete_owner_or_manager"
on public.happy_hour_menu_item_prices
for delete
to authenticated
using (
  exists (
    select 1
    from public.happy_hour_windows hw
    join public.menu_items mi on mi.id = happy_hour_menu_item_prices.menu_item_id
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id and m.venue_id = hw.venue_id
    join public.venues v on v.id = hw.venue_id
    where hw.id = happy_hour_menu_item_prices.window_id
      and (
        public.is_org_owner(v.org_id)
        or (public.is_org_manager(v.org_id) and public.has_venue_assignment(v.id))
      )
  )
);

create or replace function public.validate_happy_hour_window_menu_venue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.happy_hour_windows hw
    join public.menus m on m.venue_id = hw.venue_id
    where hw.id = new.happy_hour_window_id
      and m.id = new.menu_id
  ) then
    raise exception 'happy_hour_window_menus must link rows from the same venue';
  end if;

  return new;
end;
$$;

drop trigger if exists happy_hour_window_menus_same_venue on public.happy_hour_window_menus;
create constraint trigger happy_hour_window_menus_same_venue
after insert or update on public.happy_hour_window_menus
deferrable initially immediate
for each row execute function public.validate_happy_hour_window_menu_venue();

create or replace function public.validate_happy_hour_offer_window_venue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.happy_hour_offers o
    join public.happy_hour_windows hw on hw.venue_id = o.venue_id
    where o.id = new.offer_id
      and hw.id = new.window_id
  ) then
    raise exception 'happy_hour_offer_windows must link rows from the same venue';
  end if;

  return new;
end;
$$;

drop trigger if exists happy_hour_offer_windows_same_venue on public.happy_hour_offer_windows;
create constraint trigger happy_hour_offer_windows_same_venue
after insert or update on public.happy_hour_offer_windows
deferrable initially immediate
for each row execute function public.validate_happy_hour_offer_window_venue();

create or replace function public.validate_happy_hour_menu_item_price_venue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.happy_hour_windows hw
    join public.menu_items mi on mi.id = new.menu_item_id
    join public.menu_sections ms on ms.id = mi.section_id
    join public.menus m on m.id = ms.menu_id and m.venue_id = hw.venue_id
    where hw.id = new.window_id
  ) then
    raise exception 'happy_hour_menu_item_prices must link rows from the same venue';
  end if;

  return new;
end;
$$;

drop trigger if exists happy_hour_menu_item_prices_same_venue on public.happy_hour_menu_item_prices;
create constraint trigger happy_hour_menu_item_prices_same_venue
after insert or update on public.happy_hour_menu_item_prices
deferrable initially immediate
for each row execute function public.validate_happy_hour_menu_item_price_venue();

create or replace function public.sync_happy_hour_window_days()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.happy_hour_window_days
  where window_id = new.id;

  insert into public.happy_hour_window_days (window_id, dow)
  select new.id, day_value
  from unnest(coalesce(new.dow, array[]::int[])) as d(day_value)
  where day_value between 0 and 6
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists happy_hour_windows_sync_days on public.happy_hour_windows;
create trigger happy_hour_windows_sync_days
after insert or update of dow on public.happy_hour_windows
for each row execute function public.sync_happy_hour_window_days();

create or replace function public.sync_happy_hour_offer_window_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.happy_hour_offer_windows
  where offer_id = new.id;

  if new.window_id is not null then
    insert into public.happy_hour_offer_windows (offer_id, window_id)
    values (new.id, new.window_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists happy_hour_offers_sync_window_link on public.happy_hour_offers;
create trigger happy_hour_offers_sync_window_link
after insert or update of window_id on public.happy_hour_offers
for each row execute function public.sync_happy_hour_offer_window_link();

create or replace function public.sync_menu_item_base_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.price is null then
    delete from public.menu_item_base_prices
    where menu_item_id = new.id;
  else
    insert into public.menu_item_base_prices (menu_item_id, amount, currency, updated_at)
    values (new.id, new.price, 'USD', now())
    on conflict (menu_item_id)
    do update set amount = excluded.amount, currency = excluded.currency, updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists menu_items_sync_base_price on public.menu_items;
create trigger menu_items_sync_base_price
after insert or update of price on public.menu_items
for each row execute function public.sync_menu_item_base_price();

create or replace function public.sync_menu_item_happy_hour_prices()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_happy_hour and new.price is not null then
    insert into public.happy_hour_menu_item_prices (window_id, menu_item_id, amount, currency, updated_at)
    select hhm.happy_hour_window_id, new.id, new.price, 'USD', now()
    from public.menu_sections ms
    join public.happy_hour_window_menus hhm on hhm.menu_id = ms.menu_id
    where ms.id = new.section_id
    on conflict (window_id, menu_item_id)
    do update set amount = excluded.amount, currency = excluded.currency, updated_at = now();
  else
    delete from public.happy_hour_menu_item_prices
    where menu_item_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists menu_items_sync_happy_hour_prices on public.menu_items;
create trigger menu_items_sync_happy_hour_prices
after insert or update of price, is_happy_hour on public.menu_items
for each row execute function public.sync_menu_item_happy_hour_prices();

create or replace function public.sync_window_menu_happy_hour_prices()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.happy_hour_menu_item_prices (window_id, menu_item_id, amount, currency, updated_at)
  select new.happy_hour_window_id, mi.id, mi.price, 'USD', now()
  from public.menu_sections ms
  join public.menu_items mi on mi.section_id = ms.id
  where ms.menu_id = new.menu_id
    and mi.is_happy_hour = true
    and mi.price is not null
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists happy_hour_window_menus_sync_prices_insert on public.happy_hour_window_menus;
create trigger happy_hour_window_menus_sync_prices_insert
after insert on public.happy_hour_window_menus
for each row execute function public.sync_window_menu_happy_hour_prices();

create or replace function public.cleanup_window_menu_happy_hour_prices()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.happy_hour_menu_item_prices hp
  using public.menu_sections ms, public.menu_items mi
  where hp.window_id = old.happy_hour_window_id
    and hp.menu_item_id = mi.id
    and mi.section_id = ms.id
    and ms.menu_id = old.menu_id;

  return old;
end;
$$;

drop trigger if exists happy_hour_window_menus_sync_prices_delete on public.happy_hour_window_menus;
create trigger happy_hour_window_menus_sync_prices_delete
after delete on public.happy_hour_window_menus
for each row execute function public.cleanup_window_menu_happy_hour_prices();

create or replace function public.replace_happy_hour_window_menus(
  p_window_id uuid,
  p_menu_ids uuid[] default array[]::uuid[]
)
returns setof public.happy_hour_window_menus
language plpgsql
set search_path = public
as $$
declare
  v_venue_id uuid;
begin
  select venue_id into v_venue_id
  from public.happy_hour_windows
  where id = p_window_id;

  if v_venue_id is null then
    raise exception 'happy_hour_window_not_found';
  end if;

  if exists (
    select 1
    from (
      select distinct menu_id
      from unnest(coalesce(p_menu_ids, array[]::uuid[])) as input(menu_id)
    ) input
    left join public.menus m on m.id = input.menu_id and m.venue_id = v_venue_id
    where input.menu_id is not null
      and m.id is null
  ) then
    raise exception 'menu_not_found_for_window_venue';
  end if;

  delete from public.happy_hour_window_menus
  where happy_hour_window_id = p_window_id;

  insert into public.happy_hour_window_menus (happy_hour_window_id, menu_id)
  select p_window_id, input.menu_id
  from (
    select distinct menu_id
    from unnest(coalesce(p_menu_ids, array[]::uuid[])) as input(menu_id)
    where menu_id is not null
  ) input
  on conflict do nothing;

  return query
  select hhm.*
  from public.happy_hour_window_menus hhm
  where hhm.happy_hour_window_id = p_window_id
  order by hhm.created_at, hhm.menu_id;
end;
$$;

insert into public.happy_hour_window_days (window_id, dow)
select hw.id, d.dow
from public.happy_hour_windows hw
cross join lateral unnest(coalesce(hw.dow, array[]::int[])) as d(dow)
where d.dow between 0 and 6
on conflict do nothing;

insert into public.happy_hour_offer_windows (offer_id, window_id)
select id, window_id
from public.happy_hour_offers
where window_id is not null
on conflict do nothing;

insert into public.menu_item_base_prices (menu_item_id, amount, currency)
select id, price, 'USD'
from public.menu_items
where price is not null
on conflict (menu_item_id)
do update set amount = excluded.amount, currency = excluded.currency, updated_at = now();

insert into public.happy_hour_menu_item_prices (window_id, menu_item_id, amount, currency)
select hhm.happy_hour_window_id, mi.id, mi.price, 'USD'
from public.happy_hour_window_menus hhm
join public.menu_sections ms on ms.menu_id = hhm.menu_id
join public.menu_items mi on mi.section_id = ms.id
where mi.is_happy_hour = true
  and mi.price is not null
on conflict do nothing;

grant select on public.happy_hour_window_days to anon, authenticated;
grant select on public.happy_hour_offer_windows to anon, authenticated;
grant select on public.menu_item_base_prices to anon, authenticated;
grant select on public.happy_hour_menu_item_prices to anon, authenticated;

grant insert, update, delete on public.happy_hour_window_days to authenticated;
grant insert, update, delete on public.happy_hour_offer_windows to authenticated;
grant insert, update, delete on public.menu_item_base_prices to authenticated;
grant insert, update, delete on public.happy_hour_menu_item_prices to authenticated;

revoke all on function public.validate_happy_hour_window_menu_venue() from public;
revoke all on function public.validate_happy_hour_offer_window_venue() from public;
revoke all on function public.validate_happy_hour_menu_item_price_venue() from public;
revoke all on function public.sync_happy_hour_window_days() from public;
revoke all on function public.sync_happy_hour_offer_window_link() from public;
revoke all on function public.sync_menu_item_base_price() from public;
revoke all on function public.sync_menu_item_happy_hour_prices() from public;
revoke all on function public.sync_window_menu_happy_hour_prices() from public;
revoke all on function public.cleanup_window_menu_happy_hour_prices() from public;

revoke all on function public.replace_happy_hour_window_menus(uuid, uuid[]) from public;
grant execute on function public.replace_happy_hour_window_menus(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
