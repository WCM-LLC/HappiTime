-- Extend published_happy_hour_windows with organization and venue names.
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
