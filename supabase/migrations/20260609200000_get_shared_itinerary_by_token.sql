-- Public read path for a shared itinerary, keyed on the unguessable share_token.
--
-- Possession of the token is the authorization (the in-app shared_itinerary_read_grant
-- only covers authenticated friend-shares, not an anonymous web link). SECURITY DEFINER
-- so it bypasses RLS to read any list by token; it only ever returns a row when the exact
-- uuid token is supplied, so there is nothing to enumerate.

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
          'address', v.address,
          'neighborhood', v.neighborhood,
          'city', v.city,
          'state', v.state,
          'cuisine_type', v.cuisine_type,
          'price_tier', v.price_tier,
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

-- Lazily mint a share_token for one of the caller's own lists (used when the owner shares
-- it outside the app). Ownership-checked; returns null if the list isn't the caller's.
create or replace function public.ensure_share_token(p_list_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  update public.user_lists
    set share_token = coalesce(share_token, gen_random_uuid())
    where id = p_list_id and user_id = auth.uid()
    returning share_token into v_token;
  return v_token;
end;
$$;

revoke all on function public.ensure_share_token(uuid) from public;
grant execute on function public.ensure_share_token(uuid) to authenticated;
