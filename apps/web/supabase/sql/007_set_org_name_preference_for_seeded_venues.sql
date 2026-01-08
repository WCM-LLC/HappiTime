-- Force org name display in the app for venues seeded from happy_hour_places.
-- This does not change RLS or ownership; it only updates display preference.

update public.venues v
set
  app_name_preference = 'org',
  updated_at = now()
from public.organizations o
join (
  select distinct org_slug, venue_name
  from public.happy_hour_places
  where org_slug is not null
    and venue_name is not null
) h on h.org_slug = o.slug and h.venue_name = v.name
where v.org_id = o.id
  and v.app_name_preference is distinct from 'org';

-- Review count of seeded venues still not set to org display.
select count(*) as seeded_not_org
from public.venues v
join public.organizations o on o.id = v.org_id
join (
  select distinct org_slug, venue_name
  from public.happy_hour_places
  where org_slug is not null
    and venue_name is not null
) h on h.org_slug = o.slug and h.venue_name = v.name
where v.app_name_preference <> 'org';
