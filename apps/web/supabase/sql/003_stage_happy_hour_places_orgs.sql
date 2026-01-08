-- Stage organization + venue fields derived from happy_hour_places.name
-- Run this in Supabase SQL Editor before inserting into organizations/venues.

alter table public.happy_hour_places
  add column if not exists org_name text,
  add column if not exists venue_name text,
  add column if not exists org_slug text,
  add column if not exists venue_city text,
  add column if not exists venue_state text,
  add column if not exists venue_zip bigint;

with parsed as (
  select
    id,
    trim(
      case
        when position(' -- ' in name) > 0 then split_part(name, ' -- ', 1)
        else name
      end
    ) as org_name,
    trim(
      case
        when position(' -- ' in name) > 0 then substring(name from position(' -- ' in name) + 4)
        else name
      end
    ) as venue_name
  from public.happy_hour_places
)
update public.happy_hour_places h
set
  org_name = p.org_name,
  venue_name = p.venue_name,
  org_slug = trim(both '-' from regexp_replace(
    lower(replace(replace(p.org_name, '&', 'and'), '''', '')),
    '[^a-z0-9]+',
    '-',
    'g'
  ))
from parsed p
where h.id = p.id;

-- Manual merge: group similar names under a single organization.
update public.happy_hour_places
set
  org_name = 'City Barrel',
  org_slug = 'city-barrel'
where org_name in ('City Barrel', 'City Barrel Brewery + Kitchen');

with normalized as (
  select
    id,
    case
      when address is null then null
      else regexp_replace(
        regexp_replace(
          regexp_replace(trim(address), E'\\s+', ' ', 'g'),
          E'([a-z])([A-Z])',
          '\\1 \\2',
          'g'
        ),
        E'([A-Za-z])([0-9])',
        '\\1 \\2',
        'g'
      )
    end as address
  from public.happy_hour_places
),
matches as (
  select
    id,
    address,
    case
      when address is null then 0
      else position(',' in address)
    end as comma_pos,
    regexp_match(address, E'(?i)([A-Za-z.''\\- ]+)\\s*,\\s*(MO|KS)\\s*,?\\s*(\\d{5})') as m1,
    regexp_match(address, E'(?i)([A-Za-z.''\\- ]+)\\s*,\\s*(Missouri|Kansas)\\s*,?\\s*(\\d{5})') as m2,
    regexp_match(address, E'(?i),\\s*([^,]+)\\s*,\\s*(MO|KS)\\s*,?\\s*(\\d{5})') as m6,
    regexp_match(address, E'(?i),\\s*([^,]+)\\s*,\\s*(Missouri|Kansas)\\s*,?\\s*(\\d{5})') as m7,
    regexp_match(address, E'(?i)([A-Za-z.''\\- ]+)\\s+(MO|KS)\\s*,?\\s*(\\d{5})') as m3,
    regexp_match(address, E'(?i)([A-Za-z.''\\- ]+)\\s+(Missouri|Kansas)\\s*,?\\s*(\\d{5})') as m4,
    regexp_match(address, E'(?i)KCMO\\s*(\\d{5})') as m5,
    regexp_match(address, E'(?i).*\\b([A-Za-z.''\\- ]+)\\s*,?\\s*(MO|KS|Missouri|Kansas)\\s*,?\\s*(\\d{5})') as m8
  from normalized
),
derived as (
  select
    id,
    address,
    comma_pos,
    coalesce(m1[1], m2[1], m6[1], m7[1], m3[1], m4[1], m8[1]) as city_raw,
    coalesce(m1[2], m2[2], m6[2], m7[2], m3[2], m4[2], m8[2]) as state_raw,
    coalesce(m1[3], m2[3], m6[3], m7[3], m3[3], m4[3], m8[3]) as zip_raw,
    m5
  from matches
),
final as (
  select
    id,
    case
      when address is null or lower(trim(address)) = 'n/a' then 'Unknown'
      when m5 is not null then 'Kansas City'
      when city_raw is null then 'Unknown'
      when comma_pos = 0 then array_to_string(
        (regexp_split_to_array(trim(city_raw), E'\\s+'))
        [greatest(1, array_length(regexp_split_to_array(trim(city_raw), E'\\s+'), 1) - 1)
          :array_length(regexp_split_to_array(trim(city_raw), E'\\s+'), 1)],
        ' '
      )
      else trim(city_raw)
    end as venue_city,
    case
      when address is null or lower(trim(address)) = 'n/a' then 'Unknown'
      when m5 is not null then 'MO'
      when state_raw is null then 'Unknown'
      when lower(regexp_replace(state_raw, E'[^A-Za-z]', '', 'g')) = 'missouri' then 'MO'
      when lower(regexp_replace(state_raw, E'[^A-Za-z]', '', 'g')) = 'kansas' then 'KS'
      else upper(regexp_replace(state_raw, E'[^A-Za-z]', '', 'g'))
    end as venue_state,
    case
      when address is null or lower(trim(address)) = 'n/a' then 0
      when m5 is not null then m5[1]::bigint
      when zip_raw is null then 0
      else zip_raw::bigint
    end as venue_zip
  from derived
)
update public.happy_hour_places h
set
  venue_city = d.venue_city,
  venue_state = d.venue_state,
  venue_zip = d.venue_zip
from final d
where h.id = d.id;

-- Review counts.
select
  count(*) as place_rows,
  count(distinct org_name) as orgs,
  count(distinct (org_name, venue_name)) as venues
from public.happy_hour_places;

-- Review multi-venue orgs.
select
  org_name,
  array_agg(distinct venue_name order by venue_name) as venues
from public.happy_hour_places
group by org_name
having count(distinct venue_name) > 1
order by org_name;

-- Review placeholder usage for venue location fields.
select
  count(*) filter (where venue_city = 'Unknown') as city_unknown,
  count(*) filter (where venue_state = 'Unknown') as state_unknown,
  count(*) filter (where venue_zip = 0) as zip_unknown
from public.happy_hour_places;
