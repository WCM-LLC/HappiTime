-- Let a shared-itinerary viewer copy it into their own itineraries, and carry the
-- full map-venue payload so a shared itinerary can be plotted on the map.

-- 1. Expand get_shared_itinerary to include the ItineraryMapVenue fields (lat/lng etc.).
--    Backward-compatible: the web viewer (apps/directory /i/[token]) ignores extra keys.
create or replace function public.get_shared_itinerary(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'description', l.description,
    'author_handle', p.handle,
    'author_display_name', p.display_name,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'venue_id', v.id,
          'name', v.name,
          'slug', v.slug,
          'org_name', v.org_name,
          'address', v.address,
          'neighborhood', v.neighborhood,
          'city', v.city,
          'state', v.state,
          'zip', v.zip,
          'timezone', v.timezone,
          'tags', v.tags,
          'cuisine_type', v.cuisine_type,
          'price_tier', v.price_tier,
          'app_name_preference', v.app_name_preference,
          'status', v.status,
          'lat', v.lat,
          'lng', v.lng,
          'phone', v.phone,
          'website', v.website,
          'facebook_url', v.facebook_url,
          'instagram_url', v.instagram_url,
          'tiktok_url', v.tiktok_url,
          'promotion_tier', v.promotion_tier,
          'promotion_priority', v.promotion_priority,
          'notes', i.notes
        )
        order by i.sort_order, i.created_at
      )
      from public.user_list_items i
      join public.venues v on v.id = i.venue_id
      where i.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.user_lists l
  left join public.user_profiles p on p.user_id = l.user_id
  where l.share_token = p_token;
$$;

revoke all on function public.get_shared_itinerary(uuid) from public;
grant execute on function public.get_shared_itinerary(uuid) to anon, authenticated;

-- 2. Copy a shared itinerary (by token) into a new list owned by the caller.
create or replace function public.copy_shared_itinerary(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_src_id uuid;
  v_name text;
  v_desc text;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select id, name, description into v_src_id, v_name, v_desc
  from public.user_lists
  where share_token = p_token;

  if v_src_id is null then
    return null;  -- unknown / revoked token
  end if;

  insert into public.user_lists (user_id, name, description, visibility)
  values (v_uid, left(coalesce(v_name, 'Itinerary') || ' (saved)', 100), v_desc, 'private')
  returning id into v_new_id;

  insert into public.user_list_items (list_id, venue_id, sort_order, notes)
  select v_new_id, i.venue_id, i.sort_order, i.notes
  from public.user_list_items i
  where i.list_id = v_src_id;

  return v_new_id;
end;
$$;

revoke all on function public.copy_shared_itinerary(uuid) from public;
grant execute on function public.copy_shared_itinerary(uuid) to authenticated;
