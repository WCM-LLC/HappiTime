-- Create Happy Hour menus, sections, and items from happy_hour_places.
-- Requires happy_hour_places.org_slug and happy_hour_places.venue_name (run 003_stage...).

-- Preview: venues with at least one deal.
select
  count(distinct (h.org_slug, h.venue_name)) as venues_with_deals,
  count(distinct h.deal_description) as unique_deals
from public.happy_hour_places h
where h.org_slug is not null
  and h.venue_name is not null
  and h.deal_description is not null
  and trim(h.deal_description) <> '';

-- 1) Ensure a "Happy Hour" menu per venue that has deals.
with venues_with_deals as (
  select distinct h.org_slug, h.venue_name
  from public.happy_hour_places h
  where h.org_slug is not null
    and h.venue_name is not null
    and h.deal_description is not null
    and trim(h.deal_description) <> ''
),
venue_map as (
  select v.id as venue_id, v.name as venue_name, o.slug as org_slug
  from public.venues v
  join public.organizations o on o.id = v.org_id
)
insert into public.menus (venue_id, name, status, is_active)
select
  vm.venue_id,
  'Happy Hour' as name,
  'published' as status,
  true as is_active
from venues_with_deals vd
join venue_map vm
  on vm.org_slug = vd.org_slug
 and vm.venue_name = vd.venue_name
where not exists (
  select 1
  from public.menus m
  where m.venue_id = vm.venue_id
    and m.name = 'Happy Hour'
);

-- 2) Ensure a single section for the Happy Hour menu.
insert into public.menu_sections (menu_id, name, sort_order)
select
  m.id as menu_id,
  'Happy Hour Specials' as name,
  coalesce((
    select max(s2.sort_order) + 1
    from public.menu_sections s2
    where s2.menu_id = m.id
  ), 1) as sort_order
from public.menus m
where m.name = 'Happy Hour'
  and not exists (
    select 1
    from public.menu_sections s
    where s.menu_id = m.id
      and s.name = 'Happy Hour Specials'
  );

-- 3) Insert menu items (one per distinct deal per venue).
with place_deals as (
  select
    h.org_slug,
    h.venue_name,
    trim(h.deal_description) as deal_description,
    max(h.average_price) as average_price,
    coalesce(
      nullif(substring(trim(h.deal_description) from '\\$\\s*([0-9]+(?:\\.[0-9]{1,2})?)'), '')::numeric,
      nullif(substring(trim(h.deal_description) from '([0-9]+(?:\\.[0-9]{1,2})?)\\s*\\$'), '')::numeric
    ) as deal_price
  from public.happy_hour_places h
  where h.org_slug is not null
    and h.venue_name is not null
    and h.deal_description is not null
    and trim(h.deal_description) <> ''
  group by h.org_slug, h.venue_name, trim(h.deal_description)
),
target_sections as (
  select
    s.id as section_id,
    v.name as venue_name,
    o.slug as org_slug
  from public.menu_sections s
  join public.menus m on m.id = s.menu_id
  join public.venues v on v.id = m.venue_id
  join public.organizations o on o.id = v.org_id
  where m.name = 'Happy Hour'
    and s.name = 'Happy Hour Specials'
),
new_items as (
  select
    ts.section_id,
    pd.deal_description,
    pd.average_price,
    pd.deal_price,
    row_number() over (
      partition by ts.section_id
      order by pd.deal_description
    ) as rn
  from place_deals pd
  join target_sections ts
    on ts.org_slug = pd.org_slug
   and ts.venue_name = pd.venue_name
  where not exists (
    select 1
    from public.menu_items mi
    where mi.section_id = ts.section_id
      and coalesce(mi.description, '') = pd.deal_description
  )
),
sort_base as (
  select section_id, coalesce(max(sort_order), 0) as base_sort
  from public.menu_items
  group by section_id
)
insert into public.menu_items (section_id, name, description, is_happy_hour, sort_order, price)
select
  ni.section_id,
  'Happy Hour Offer ' || ni.rn as name,
  ni.deal_description as description,
  true as is_happy_hour,
  ni.rn + coalesce(sb.base_sort, 0) as sort_order,
  coalesce(ni.deal_price, ni.average_price) as price
from new_items ni
left join sort_base sb on sb.section_id = ni.section_id;

-- 4) Backfill prices for existing happy hour items missing a price.
with place_deals as (
  select
    h.org_slug,
    h.venue_name,
    trim(h.deal_description) as deal_description,
    max(h.average_price) as average_price,
    coalesce(
      nullif(substring(trim(h.deal_description) from '\\$\\s*([0-9]+(?:\\.[0-9]{1,2})?)'), '')::numeric,
      nullif(substring(trim(h.deal_description) from '([0-9]+(?:\\.[0-9]{1,2})?)\\s*\\$'), '')::numeric
    ) as deal_price
  from public.happy_hour_places h
  where h.org_slug is not null
    and h.venue_name is not null
    and h.deal_description is not null
    and trim(h.deal_description) <> ''
  group by h.org_slug, h.venue_name, trim(h.deal_description)
),
target_items as (
  select
    mi.id,
    coalesce(pd.deal_price, pd.average_price) as price
  from public.menu_items mi
  join public.menu_sections s on s.id = mi.section_id
  join public.menus m on m.id = s.menu_id
  join public.venues v on v.id = m.venue_id
  join public.organizations o on o.id = v.org_id
  join place_deals pd
    on pd.org_slug = o.slug
   and pd.venue_name = v.name
   and pd.deal_description = mi.description
  where m.name = 'Happy Hour'
    and s.name = 'Happy Hour Specials'
    and mi.is_happy_hour = true
    and mi.price is null
)
update public.menu_items mi
set price = ti.price
from target_items ti
where mi.id = ti.id
  and ti.price is not null;

-- Review counts.
select
  count(*) as menus_created
from public.menus
where name = 'Happy Hour';

select
  count(*) as sections_created
from public.menu_sections
where name = 'Happy Hour Specials';

select
  count(*) as items_created
from public.menu_items
where is_happy_hour = true;
