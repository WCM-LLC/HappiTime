-- Three follow-ups from the last review of #254 (guide → companion itinerary).
--
--   1. A venue INSERTED already-published, under a slug a published guide links,
--      was not picked up until the guide was next saved. This project deletes
--      unwanted venues and recreates them, so that is an ordinary path here.
--   2. Retiring a companion cleared its public link, but a friend it had been
--      shared with in the app kept an itinerary_share grant, and
--      record_itinerary_touch still accepted that grant — so an unpublished
--      guide could keep earning its author credit.
--   3. Two re-syncs of the same guide could interleave: one that had already
--      seen the guide as eligible could resume after another retired it, and
--      mint a new link for a guide that was no longer eligible.
--
-- Each function below is restated in full from the migration named beside it,
-- with only the change described. test/guide-itinerary-followups.test.mjs holds
-- them to that.

-- ── 3. One sync per guide at a time ──────────────────────────────────────────
-- From 20261011050000. Adds the advisory lock; nothing else changes.
create or replace function public.sync_guide_itinerary(p_guide_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guide   record;
  v_list_id uuid;
  v_count   int;
begin
  -- One sync per guide at a time, held to the end of the transaction. Taken
  -- BEFORE anything is read: under READ COMMITTED each statement below then sees
  -- whatever the previous holder committed, so a sync that waited here cannot
  -- act on eligibility that has since been lost (and re-mint a retired link).
  perform pg_advisory_xact_lock(hashtextextended('guide_itinerary:' || p_guide_id::text, 0));

  -- Tells guard_guide_companion_list that this is the guide sync (the only thing
  -- allowed to give a retired companion its link back). Transaction-local, and
  -- switched off again on every way out.
  perform set_config('happitime.guide_sync', 'on', true);

  select g.id, g.title, g.subtitle, g.body_md, g.author_id, g.status
    into v_guide
  from public.guides g
  where g.id = p_guide_id;

  select l.id into v_list_id
  from public.user_lists l
  where l.source_guide_id = p_guide_id;

  if v_guide.id is not null
     and v_guide.status = 'published'
     and v_guide.author_id is not null
     and exists (select 1 from public.user_profiles p
                 where p.user_id = v_guide.author_id and p.role = 'super_user') then
    select count(*) into v_count
    from public.guide_venue_slugs(v_guide.body_md) s
    join public.venues v on v.slug = s.slug and v.status = 'published';
  else
    v_count := 0;
  end if;

  if v_count = 0 then
    if v_list_id is not null then
      update public.user_lists
      set share_token = null,
          visibility  = 'private'   -- retired companions leave the Insider feed too
      where id = v_list_id and (share_token is not null or visibility <> 'private');
    end if;
    perform set_config('happitime.guide_sync', 'off', true);
    return null;
  end if;

  if v_list_id is null then
    insert into public.user_lists
      (user_id, name, description, visibility, share_token, source_guide_id)
    values
      (v_guide.author_id, left(v_guide.title, 100), v_guide.subtitle, 'private',
       gen_random_uuid(), p_guide_id)
    returning id into v_list_id;
  else
    -- user_id follows the guide: if authorship changes, so does who earns credit.
    update public.user_lists
    set user_id     = v_guide.author_id,
        name        = left(v_guide.title, 100),
        description = v_guide.subtitle,
        visibility  = 'private',   -- a companion never sits in the Insider feed
        share_token = coalesce(share_token, gen_random_uuid())
    where id = v_list_id;
  end if;

  -- Items mirror the guide's links, in the order the guide mentions them.
  -- Notes the author added in the app are left alone.
  delete from public.user_list_items i
  where i.list_id = v_list_id
    and i.venue_id not in (
      select v.id
      from public.guide_venue_slugs(v_guide.body_md) s
      join public.venues v on v.slug = s.slug and v.status = 'published'
    );

  insert into public.user_list_items (list_id, venue_id, sort_order)
  select v_list_id, v.id, s.ord
  from public.guide_venue_slugs(v_guide.body_md) s
  join public.venues v on v.slug = s.slug and v.status = 'published'
  on conflict (list_id, venue_id) do update set sort_order = excluded.sort_order;

  perform set_config('happitime.guide_sync', 'off', true);
  return v_list_id;
end;
$$;
revoke all on function public.sync_guide_itinerary(uuid) from public, anon, authenticated;

-- From 20261011050000. Deleting a guide retires its link under the same lock.
create or replace function public.guides_retire_itinerary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Same per-guide lock as sync_guide_itinerary. Without it a sync that had
  -- already read this guide as eligible could resume after the delete and mint
  -- a new link on the list this is about to detach.
  perform pg_advisory_xact_lock(hashtextextended('guide_itinerary:' || old.id::text, 0));

  update public.user_lists set share_token = null
  where source_guide_id = old.id and share_token is not null;
  return old;
end;
$$;
revoke all on function public.guides_retire_itinerary() from public, anon, authenticated;

-- ── 1. Venues born published ─────────────────────────────────────────────────
-- From 20261011050000. Now also handles INSERT, and re-syncs guides in id order.
create or replace function public.venues_resync_guide_itineraries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_id       uuid;
  v_old_slug text;
  v_new_slug text;
begin
  -- OLD does not exist on INSERT and NEW does not exist on DELETE, so each is
  -- only read in the branch where it is assigned.
  if tg_op = 'INSERT' then
    v_id := new.id;  v_old_slug := lower(new.slug);  v_new_slug := lower(new.slug);
  elsif tg_op = 'UPDATE' then
    v_id := new.id;  v_old_slug := lower(old.slug);  v_new_slug := lower(new.slug);
  else
    v_id := old.id;  v_old_slug := lower(old.slug);  v_new_slug := lower(old.slug);
  end if;

  -- On DELETE the FK cascade has already removed the venue's items, so guides
  -- are found by the slug they link; the sync then retires a companion that is
  -- left with no eligible venue. Ordered by id so two transactions that each
  -- re-sync several guides take the per-guide locks in the same order.
  for r in
    select g.id
    from public.guides g
    where g.status = 'published'
      and (
        exists (select 1 from public.guide_venue_slugs(g.body_md) s
                where s.slug in (v_old_slug, v_new_slug))
        or exists (select 1 from public.user_lists l
                   join public.user_list_items i on i.list_id = l.id
                   where l.source_guide_id = g.id and i.venue_id = v_id)
      )
    order by g.id
  loop
    perform public.sync_guide_itinerary(r.id);
  end loop;
  return null;
exception when others then
  raise warning 'venues_resync_guide_itineraries failed for venue %: %', v_id, sqlerrm;
  return null;
end;
$$;
revoke all on function public.venues_resync_guide_itineraries() from public, anon, authenticated;

-- Only a venue inserted as published can make a guide newly eligible; a draft
-- becomes relevant when it is published, which the existing UPDATE trigger sees.
drop trigger if exists venues_resync_guide_itineraries_ins_trg on public.venues;
create trigger venues_resync_guide_itineraries_ins_trg
  after insert on public.venues
  for each row
  when (new.status = 'published')
  execute function public.venues_resync_guide_itineraries();

-- From 20261011050000. Same lock-ordering change for the author-side re-sync.
create or replace function public.user_profiles_resync_guide_itineraries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_user uuid := old.user_id;   -- same on UPDATE; the only row there is on DELETE
begin
  for r in select g.id from public.guides g where g.author_id = v_user order by g.id loop
    perform public.sync_guide_itinerary(r.id);
  end loop;
  return null;
exception when others then
  raise warning 'user_profiles_resync_guide_itineraries failed for user %: %', v_user, sqlerrm;
  return null;
end;
$$;
revoke all on function public.user_profiles_resync_guide_itineraries() from public, anon, authenticated;

-- ── 2. A retired companion earns nothing, however it was shared ──────────────
-- From 20261011031500. Adds the last condition on the list lookup; the friend
-- can still open the itinerary they were sent, it just no longer logs a touch.
create or replace function public.record_itinerary_touch(
  p_list_id  uuid,
  p_venue_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select l.user_id into v_owner
  from public.user_lists l
  where l.id = p_list_id
    and (l.visibility = 'public'
         or l.share_token is not null
         or public.itinerary_shared_with_me(l.id))
    -- A guide's companion earns touches only while it is live. The sync clears
    -- its share_token when the guide is unpublished, the author is demoted or no
    -- linked venue is left — but a friend it was shared with in the app still
    -- holds an itinerary_share grant, which would otherwise keep crediting the
    -- author for a guide that is no longer published.
    and (l.source_guide_id is null or l.share_token is not null);

  if v_owner is null or v_owner = v_uid then
    return;                                   -- unknown / not visible / own list
  end if;
  if not exists (select 1 from public.user_profiles p
                 where p.user_id = v_owner and p.role = 'super_user') then
    return;                                   -- only Insiders earn touches
  end if;

  insert into public.super_user_venue_touches
    (super_user_id, user_id, venue_id, kind, subject_id)
  select v_owner, v_uid, i.venue_id,
         case when p_venue_id is null then 'itinerary_view' else 'itinerary_venue_tap' end,
         p_list_id
  from public.user_list_items i
  where i.list_id = p_list_id
    and (p_venue_id is null or i.venue_id = p_venue_id)
  -- Same (user, Insider, venue, kind) again today: keep one row but move it to
  -- now, so "last touch" really is the last one. Staying inside the same UTC day
  -- means the unique key is unchanged.
  on conflict (user_id, super_user_id, venue_id, kind, ((created_at at time zone 'utc')::date))
  do update set created_at = excluded.created_at,
                subject_id = excluded.subject_id;
end;
$$;
revoke all on function public.record_itinerary_touch(uuid, uuid) from public, anon;
grant execute on function public.record_itinerary_touch(uuid, uuid) to authenticated;

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Pick up any venue that was born published since the companions were built.
do $$
declare
  r record;
begin
  for r in select id from public.guides where status = 'published' order by id loop
    perform public.sync_guide_itinerary(r.id);
  end loop;
end;
$$;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- drop trigger if exists venues_resync_guide_itineraries_ins_trg on public.venues;
-- (restore sync_guide_itinerary, guides_retire_itinerary,
--  venues_resync_guide_itineraries and
--  user_profiles_resync_guide_itineraries from 20261011050000, and
--  record_itinerary_touch from 20261011031500)
