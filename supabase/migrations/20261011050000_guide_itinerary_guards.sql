-- Close the three gaps left open by 20261011041500_guide_itineraries.sql
-- (review of #250; see docs/superpowers/specs/2026-10-10-guides-count-via-itineraries.md).
--
--   A. Eligibility was only re-checked when the GUIDE was written. Unpublishing
--      a venue, changing its slug, or promoting / demoting the author left the
--      companion itinerary stale until some unrelated guide edit.
--   B. The companion is an ordinary owned list, so its author could delete it
--      (the guide card disappears), flip it public (it lands in the Insider
--      feed) or change its venues (it stops matching the guide).
--   C. Retiring the public link when a guide is deleted failed OPEN: if the
--      token-clearing update raised, the delete still committed and the FK
--      detached the list with a live token nothing could find again.

-- ── A. Re-sync when something a companion depends on changes ─────────────────
-- A venue's status or slug changed, or the venue was deleted: re-sync every
-- published guide that links the old or new slug, or already carries the venue. There are a handful of
-- guides; this runs only on a status / slug change, never on ordinary venue
-- edits. Guarded: venue writes must never fail because of a guide.
create or replace function public.venues_resync_guide_itineraries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_id       uuid := old.id;
  v_old_slug text := lower(old.slug);
  v_new_slug text := lower(old.slug);   -- DELETE: there is no new row
begin
  if tg_op = 'UPDATE' then
    v_new_slug := lower(new.slug);
  end if;

  -- On DELETE the FK cascade has already removed the venue's items, so guides
  -- are found by the slug they link; the sync then retires a companion that is
  -- left with no eligible venue.
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

drop trigger if exists venues_resync_guide_itineraries_trg on public.venues;
create trigger venues_resync_guide_itineraries_trg
  after update of status, slug on public.venues
  for each row
  when (old.status is distinct from new.status or old.slug is distinct from new.slug)
  execute function public.venues_resync_guide_itineraries();

-- Deleting a venue is an eligibility change too (this project hard-deletes
-- unwanted venues rather than archiving them).
drop trigger if exists venues_resync_guide_itineraries_del_trg on public.venues;
create trigger venues_resync_guide_itineraries_del_trg
  after delete on public.venues
  for each row execute function public.venues_resync_guide_itineraries();

-- The author was promoted to / demoted from super_user: their guides gain or
-- lose their companions straight away, instead of at the next guide edit.
create or replace function public.user_profiles_resync_guide_itineraries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select g.id from public.guides g where g.author_id = new.user_id loop
    perform public.sync_guide_itinerary(r.id);
  end loop;
  return null;
exception when others then
  raise warning 'user_profiles_resync_guide_itineraries failed for user %: %', new.user_id, sqlerrm;
  return null;
end;
$$;
revoke all on function public.user_profiles_resync_guide_itineraries() from public, anon, authenticated;

drop trigger if exists user_profiles_resync_guide_itineraries_trg on public.user_profiles;
create trigger user_profiles_resync_guide_itineraries_trg
  after update of role on public.user_profiles
  for each row
  when (old.role is distinct from new.role)
  execute function public.user_profiles_resync_guide_itineraries();

-- ── B. A companion list is managed by its guide ──────────────────────────────
-- Direct client writes (the app, signed in as the author) may not delete a
-- companion, change who owns it or how it is shared, or change its venue set.
-- They may still rename it and edit item notes; the name is overwritten at the
-- next guide save.
--
-- "Direct client write" = current_user is `authenticated` or `anon`. Everything
-- that legitimately manages these rows runs as the function / table owner and
-- passes untouched: sync_guide_itinerary and the triggers above (SECURITY
-- DEFINER), ensure_share_token, account-deletion cleanup, FK cascades when a
-- user or venue is deleted, and the service role.
create or replace function public.guard_guide_companion_list()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    -- Privileged callers pass, with one exception: a companion whose link was
    -- retired (guide unpublished, author demoted, no eligible venue) may only be
    -- given a link again by the guide sync. Otherwise the app's ordinary "share"
    -- button — ensure_share_token, SECURITY DEFINER — would quietly revive it.
    if tg_op = 'UPDATE'
       and old.source_guide_id is not null
       and old.share_token is null
       and new.share_token is not null
       and coalesce(current_setting('happitime.guide_sync', true), '') <> 'on' then
      raise exception 'This itinerary was retired along with its guide. Publish the guide again to share it.'
        using errcode = 'P0001';
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.source_guide_id is not null then
      raise exception 'This itinerary belongs to your guide. Remove the venue links from the guide, or unpublish it, instead of deleting the itinerary.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- INSERT / UPDATE: a client can neither create a companion nor attach / detach one.
  if tg_op = 'INSERT' then
    if new.source_guide_id is not null then
      raise exception 'source_guide_id is managed by the guide sync' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.source_guide_id is distinct from old.source_guide_id then
    raise exception 'source_guide_id is managed by the guide sync' using errcode = 'P0001';
  end if;
  if old.source_guide_id is not null and (
       new.visibility  is distinct from old.visibility
    or new.share_token is distinct from old.share_token
    or new.user_id     is distinct from old.user_id
  ) then
    raise exception 'This itinerary belongs to your guide, so its sharing settings are managed there.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_guide_companion_list() from public, anon, authenticated;

drop trigger if exists user_lists_guard_guide_companion on public.user_lists;
create trigger user_lists_guard_guide_companion
  before insert or update or delete on public.user_lists
  for each row execute function public.guard_guide_companion_list();

create or replace function public.guard_guide_companion_items()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_msg constant text := 'This itinerary mirrors the venues linked in your guide. Edit the guide to change them.';
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and exists (select 1 from public.user_lists l
                 where l.id = old.list_id and l.source_guide_id is not null) then
    if tg_op = 'DELETE' then
      raise exception '%', v_msg using errcode = 'P0001';
    end if;
    -- UPDATE of a companion item: notes only.
    if new.list_id    is distinct from old.list_id
       or new.venue_id   is distinct from old.venue_id
       or new.sort_order is distinct from old.sort_order then
      raise exception '%', v_msg using errcode = 'P0001';
    end if;
  end if;

  -- INSERT into, or UPDATE moving an item into, a companion.
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.list_id is distinct from old.list_id)
     and exists (select 1 from public.user_lists l
                 where l.id = new.list_id and l.source_guide_id is not null) then
    raise exception '%', v_msg using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;
revoke all on function public.guard_guide_companion_items() from public, anon, authenticated;

drop trigger if exists user_list_items_guard_guide_companion on public.user_list_items;
create trigger user_list_items_guard_guide_companion
  before insert or update or delete on public.user_list_items
  for each row execute function public.guard_guide_companion_items();

-- ── B2. The sync, restated ───────────────────────────────────────────────────
-- Same function as 20261011041500 with two changes: it announces itself to the
-- guard above (so it alone can revive a retired companion), and it puts an
-- existing companion back to `private` — one an author made public before these
-- guards existed would otherwise be stuck in the Insider feed, since the guard
-- now refuses the author's own attempt to change it back.
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
      update public.user_lists set share_token = null
      where id = v_list_id and share_token is not null;
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

-- ── C. Retiring a deleted guide's link fails CLOSED ──────────────────────────
-- No EXCEPTION guard any more: if the token cannot be cleared, the delete aborts
-- and can be retried, rather than committing with a live, unfindable link.
-- (Saving and publishing a guide stay guarded — only deletion is strict.)
create or replace function public.guides_retire_itinerary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_lists set share_token = null
  where source_guide_id = old.id and share_token is not null;
  return old;
end;
$$;
revoke all on function public.guides_retire_itinerary() from public, anon, authenticated;

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Bring every existing companion in line with the rules as they stand today
-- (a venue unpublished, or an author demoted, since the companion was built).
do $$
declare
  r record;
begin
  for r in
    select g.id from public.guides g
    where g.status = 'published'
       or exists (select 1 from public.user_lists l where l.source_guide_id = g.id)
  loop
    perform public.sync_guide_itinerary(r.id);
  end loop;
end;
$$;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- drop trigger if exists user_list_items_guard_guide_companion on public.user_list_items;
-- drop trigger if exists user_lists_guard_guide_companion on public.user_lists;
-- drop trigger if exists user_profiles_resync_guide_itineraries_trg on public.user_profiles;
-- drop trigger if exists venues_resync_guide_itineraries_trg on public.venues;
-- drop trigger if exists venues_resync_guide_itineraries_del_trg on public.venues;
-- (restore sync_guide_itinerary from 20261011041500)
-- drop function if exists public.guard_guide_companion_items();
-- drop function if exists public.guard_guide_companion_list();
-- drop function if exists public.user_profiles_resync_guide_itineraries();
-- drop function if exists public.venues_resync_guide_itineraries();
-- (restore guides_retire_itinerary's EXCEPTION guard from 20261011041500)
