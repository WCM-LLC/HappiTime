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
-- A venue's status or slug changed: re-sync every published guide that links
-- the old or new slug, or already carries the venue. There are a handful of
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
begin
  for r in
    select g.id
    from public.guides g
    where g.status = 'published'
      and (
        exists (select 1 from public.guide_venue_slugs(g.body_md) s
                where s.slug in (lower(old.slug), lower(new.slug)))
        or exists (select 1 from public.user_lists l
                   join public.user_list_items i on i.list_id = l.id
                   where l.source_guide_id = g.id and i.venue_id = new.id)
      )
  loop
    perform public.sync_guide_itinerary(r.id);
  end loop;
  return null;
exception when others then
  raise warning 'venues_resync_guide_itineraries failed for venue %: %', new.id, sqlerrm;
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
-- drop function if exists public.guard_guide_companion_items();
-- drop function if exists public.guard_guide_companion_list();
-- drop function if exists public.user_profiles_resync_guide_itineraries();
-- drop function if exists public.venues_resync_guide_itineraries();
-- (restore guides_retire_itinerary's EXCEPTION guard from 20261011041500)
