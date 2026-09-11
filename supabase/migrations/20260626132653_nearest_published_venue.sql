-- Coaster onboarding (ON2): nearest_published_venue RPC.
--
-- Given a point, return the closest *published* venue within a search radius,
-- with distance and the venue's own geofence radius so the client can both label
-- ("You're at X") and let verify-checkin enforce the strict per-venue fence at the
-- actual check-in. Used by the post-signup geofence gate to decide whether a
-- brand-new user (a coaster-in-a-bar scanner) is dropped into a venue check-in.
--
-- Plain haversine (no PostGIS / earthdistance — neither is enabled). A bounding-box
-- prefilter keeps it index-friendly. p_max_m is the *search* radius (250 m default
-- so GPS jitter near the door still matches); verify-checkin still enforces the
-- strict per-venue geofence_radius_m at the real check-in — this only decides routing.

create or replace function public.nearest_published_venue(
  p_lat double precision,
  p_lng double precision,
  p_max_m integer default 250
)
returns table (
  venue_id uuid,
  slug text,
  name text,
  lat double precision,
  lng double precision,
  geofence_radius_m integer,
  distance_m double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with bounded as (
    select v.id, v.slug, v.name, v.lat, v.lng, v.geofence_radius_m,
           2 * 6371000 * asin(sqrt(
             power(sin(radians(v.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(v.lat)) *
             power(sin(radians(v.lng - p_lng) / 2), 2)
           )) as distance_m
    from public.venues v
    where v.status = 'published'
      and v.lat is not null and v.lng is not null
      -- ~ p_max_m box prefilter (1 deg lat ≈ 111_320 m); generous, refined by haversine below
      and v.lat between p_lat - (p_max_m / 111320.0) and p_lat + (p_max_m / 111320.0)
      and v.lng between p_lng - (p_max_m / (111320.0 * cos(radians(p_lat))))
                    and p_lng + (p_max_m / (111320.0 * cos(radians(p_lat))))
  )
  select id, slug, name, lat, lng, geofence_radius_m, distance_m
  from bounded
  where distance_m <= p_max_m
  order by distance_m asc
  limit 1;
$$;

-- Authenticated-only execute. Supabase's default privileges auto-grant EXECUTE to
-- anon/authenticated/service_role on every new function, so revoking from PUBLIC is
-- not enough — anon keeps a direct grant. Revoke those explicit grants too; this RPC
-- is only ever called as the signed-in user (the onboarding geofence gate), and no
-- edge function references it.
revoke all on function public.nearest_published_venue(double precision, double precision, integer) from public, anon, service_role;
grant execute on function public.nearest_published_venue(double precision, double precision, integer) to authenticated;
