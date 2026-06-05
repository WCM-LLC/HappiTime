-- Shared-itinerary read access for the recipient.
--
-- Problem: tapping a shared-itinerary push notification (or trying to list the
-- itineraries shared with you) dead-ended because the recipient had no read
-- path. user_lists / user_list_items SELECT was "owner or public", and most
-- shared lists are private. The shares themselves are recorded as user_events
-- rows (event_type='itinerary_share', meta.list_id, meta.shared_with_user_id),
-- which are owner-only readable -- so the recipient can't even enumerate them.
--
-- Fix: grant the recipient read access to the specific shared list (+ its
-- items), scoped to shares that were authored by the list's OWNER. The
-- owner-authored check is load-bearing for security: user_events INSERT only
-- enforces user_id = auth.uid() and never validates that the inserter owns
-- meta.list_id, so a grant keyed solely on meta.shared_with_user_id would let
-- any user forge an itinerary_share row to self-grant read on someone else's
-- private list. Requiring e.user_id = l.user_id (the list owner) closes that.
--
-- Both helpers are SECURITY DEFINER so they can read the owner-only user_events
-- rows the recipient cannot. They compare ids as text (never cast untrusted
-- meta to uuid) so a forged row with a malformed meta.list_id cannot raise and
-- break a victim's query.

-- 1) Grant predicate, used inside the RLS SELECT policies below.
create or replace function public.itinerary_shared_with_me(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_events e
    join public.user_lists l on l.id = p_list_id
    where e.event_type = 'itinerary_share'
      and e.user_id = l.user_id                            -- share authored by the list owner
      and e.meta->>'list_id' = p_list_id::text
      and e.meta->>'shared_with_user_id' = auth.uid()::text
  );
$$;

revoke all on function public.itinerary_shared_with_me(uuid) from public;
grant execute on function public.itinerary_shared_with_me(uuid) to authenticated;

-- 2) Enumerate the itineraries shared with the caller. Needed because the
--    recipient cannot read the owner-only user_events share rows directly.
create or replace function public.list_itineraries_shared_with_me()
returns table (
  list_id uuid,
  name text,
  description text,
  owner_id uuid,
  updated_at timestamptz,
  author_handle text,
  author_display_name text,
  author_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (l.id)
    l.id,
    l.name,
    l.description,
    l.user_id,
    l.updated_at,
    p.handle,
    p.display_name,
    p.avatar_url
  from public.user_events e
  join public.user_lists l on l.id::text = e.meta->>'list_id'   -- text compare: no cast on untrusted meta
  left join public.user_profiles p on p.user_id = l.user_id
  where e.event_type = 'itinerary_share'
    and e.user_id = l.user_id                                   -- authored by the list owner
    and e.meta->>'shared_with_user_id' = auth.uid()::text
  order by l.id, l.updated_at desc;
$$;

revoke all on function public.list_itineraries_shared_with_me() from public;
grant execute on function public.list_itineraries_shared_with_me() to authenticated;

-- 3) Extend the SELECT policies to also permit a recipient of an owner-authored
--    share. Names are preserved (drop + recreate) to avoid policy churn.
drop policy if exists "user_lists_select_owner_or_public" on public.user_lists;
create policy "user_lists_select_owner_or_public"
on public.user_lists
for select
using (
  user_id = auth.uid()
  or visibility = 'public'
  or public.itinerary_shared_with_me(id)
);

drop policy if exists "user_list_items_select_owner_or_public" on public.user_list_items;
create policy "user_list_items_select_owner_or_public"
on public.user_list_items
for select
using (
  exists (
    select 1
    from public.user_lists l
    where l.id = list_id
      and (l.user_id = auth.uid() or l.visibility = 'public')
  )
  or public.itinerary_shared_with_me(list_id)
);
