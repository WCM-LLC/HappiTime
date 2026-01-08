-- Insert organizations and venues from staged happy_hour_places rows.
-- Assumes org_name, venue_name, and org_slug are already populated.

-- Preflight: confirm created_by is nullable (should be, to keep owners unset).
select
  column_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'organizations'
  and column_name in ('created_by', 'slug', 'name');

-- Organizations (no owner).
insert into public.organizations (name, slug, created_by)
select distinct
  h.org_name,
  h.org_slug,
  null::uuid as created_by
from public.happy_hour_places h
where h.org_name is not null
  and h.org_slug is not null
on conflict (slug) do nothing;

-- Venues (dedupe by org + venue name; pick the longest address).
with venue_source as (
  select distinct on (org_name, venue_name)
    org_name,
    org_slug,
    venue_name,
    nullif(trim(address), '') as address,
    coalesce(nullif(trim(venue_city), ''), 'Unknown') as city,
    coalesce(nullif(trim(venue_state), ''), 'Unknown') as state,
    coalesce(venue_zip, 0) as zip
  from public.happy_hour_places
  order by org_name, venue_name, length(address) desc nulls last
)
insert into public.venues (org_id, name, address, city, state, zip)
select
  o.id as org_id,
  v.venue_name as name,
  v.address,
  v.city,
  v.state,
  v.zip
from venue_source v
join public.organizations o on o.slug = v.org_slug
where v.venue_name is not null
  and not exists (
    select 1
    from public.venues existing
    where existing.org_id = o.id
      and existing.name = v.venue_name
  );

-- Publish venues that have an address.
update public.venues
set
  status = 'published',
  published_at = coalesce(published_at, now()),
  updated_at = now()
where address is not null
  and trim(address) <> ''
  and lower(trim(address)) <> 'n/a'
  and status is distinct from 'published';

-- Review counts for the inserted set.
select
  count(*) as orgs_inserted
from public.organizations
where slug in (
  select distinct org_slug
  from public.happy_hour_places
  where org_slug is not null
);

select
  count(*) as venues_inserted
from public.venues v
join public.organizations o on o.id = v.org_id
where o.slug in (
  select distinct org_slug
  from public.happy_hour_places
  where org_slug is not null
);
