-- Create happy_hour_windows from happy_hour_places and attach "Happy Hour" menus.
-- Assumes orgs/venues/menus already exist and happy_hour_places has org_slug + venue_name.

-- Tunable defaults for venues with no time ranges in deal_description.
with config as (
  select
    time '15:00' as fallback_start_time,
    time '18:00' as fallback_end_time,
    'Hours TBD'::text as fallback_label,
    'published'::text as window_status,
    'draft'::text as fallback_status
),
venue_map as (
  select v.id as venue_id, v.name as venue_name, o.slug as org_slug, coalesce(v.timezone, 'America/Chicago') as timezone
  from public.venues v
  join public.organizations o on o.id = v.org_id
),
mapped_places as (
  select
    vm.venue_id,
    vm.timezone,
    h.happy_days,
    h.deal_description,
    regexp_replace(
      regexp_replace(h.deal_description, E'[–—]', '-', 'g'),
      E'(?i)\\b([ap])\\.m\\.?',
      E'\\1m',
      'g'
    ) as clean_desc,
    (
      select coalesce(
        array_agg(distinct dow order by dow),
        array[0,1,2,3,4,5,6]::int[]
      )
      from (
        select case d
          when 'Sun' then 0
          when 'Mon' then 1
          when 'Tue' then 2
          when 'Wed' then 3
          when 'Thu' then 4
          when 'Fri' then 5
          when 'Sat' then 6
          else null
        end as dow
        from unnest(h.happy_days) as d
      ) days
      where dow is not null
    ) as dow
  from public.happy_hour_places h
  join venue_map vm
    on vm.org_slug = h.org_slug
   and vm.venue_name = h.venue_name
  where h.deal_description is not null
    and trim(h.deal_description) <> ''
),
parsed as (
  select
    mp.*,
    regexp_match(
      mp.clean_desc,
      E'(?i)(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s*(?:-|to|until|--)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)'
    ) as m
  from mapped_places mp
),
range_rows as (
  select
    venue_id,
    dow,
    timezone,
    m[1] as sh,
    m[2] as sm,
    coalesce(m[3], m[6]) as s_mer,
    m[4] as eh,
    m[5] as em,
    m[6] as e_mer
  from parsed
  where m is not null
),
range_windows as (
  select distinct
    venue_id,
    dow,
    make_time(
      case
        when lower(s_mer) = 'pm' and sh::int < 12 then sh::int + 12
        when lower(s_mer) = 'am' and sh::int = 12 then 0
        else sh::int
      end,
      coalesce(sm, '0')::int,
      0
    ) as start_time,
    make_time(
      case
        when lower(e_mer) = 'pm' and eh::int < 12 then eh::int + 12
        when lower(e_mer) = 'am' and eh::int = 12 then 0
        else eh::int
      end,
      coalesce(em, '0')::int,
      0
    ) as end_time,
    timezone,
    null::text as label
  from range_rows
),
venues_no_ranges as (
  select venue_id, timezone
  from parsed
  group by venue_id, timezone
  having count(*) filter (where m is not null) = 0
),
venues_no_ranges_days as (
  select
    p.venue_id,
    p.timezone,
    coalesce(array_agg(distinct d order by d), array[0,1,2,3,4,5,6]::int[]) as dow
  from parsed p
  join venues_no_ranges vnr on vnr.venue_id = p.venue_id
  cross join unnest(p.dow) as d
  group by p.venue_id, p.timezone
),
fallback_windows as (
  select
    vnr.venue_id,
    vnr.dow,
    cfg.fallback_start_time as start_time,
    cfg.fallback_end_time as end_time,
    vnr.timezone,
    cfg.fallback_label as label
  from venues_no_ranges_days vnr
  cross join config cfg
),
all_windows as (
  select * from range_windows
  union all
  select * from fallback_windows
)
insert into public.happy_hour_windows (venue_id, dow, start_time, end_time, timezone, status, label)
select
  aw.venue_id,
  aw.dow,
  aw.start_time,
  aw.end_time,
  aw.timezone,
  case
    when aw.label is not null then cfg.fallback_status
    else cfg.window_status
  end as status,
  aw.label
from all_windows aw
cross join config cfg
where not exists (
  select 1
  from public.happy_hour_windows hw
  where hw.venue_id = aw.venue_id
    and hw.dow = aw.dow
    and hw.start_time = aw.start_time
    and hw.end_time = aw.end_time
);

-- Attach the "Happy Hour" menu to each window for venues seeded from happy_hour_places.
with venue_map as (
  select v.id as venue_id, v.name as venue_name, o.slug as org_slug
  from public.venues v
  join public.organizations o on o.id = v.org_id
),
venues_with_places as (
  select distinct vm.venue_id
  from public.happy_hour_places h
  join venue_map vm
    on vm.org_slug = h.org_slug
   and vm.venue_name = h.venue_name
),
target_windows as (
  select hw.id, hw.venue_id
  from public.happy_hour_windows hw
  join venues_with_places vwp on vwp.venue_id = hw.venue_id
),
target_menus as (
  select m.id as menu_id, m.venue_id
  from public.menus m
  where m.name = 'Happy Hour'
)
insert into public.happy_hour_window_menus (happy_hour_window_id, menu_id)
select
  tw.id,
  tm.menu_id
from target_windows tw
join target_menus tm on tm.venue_id = tw.venue_id
where not exists (
  select 1
  from public.happy_hour_window_menus hwm
  where hwm.happy_hour_window_id = tw.id
    and hwm.menu_id = tm.menu_id
);

-- Review counts.
select count(*) as windows_total from public.happy_hour_windows;
select count(*) as window_menu_links from public.happy_hour_window_menus;
