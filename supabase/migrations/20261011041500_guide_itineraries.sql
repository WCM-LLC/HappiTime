-- Make Guides count toward Insider check-in influence.
--
-- Problem: a guide is free markdown read on the anonymous web, so there is no
-- signed-in user to attribute and no guide → venue mapping to attribute to.
-- Option B rules out bridging web readers to app users with an MMP.
--
-- Approach: don't build a second attribution path — put guides on the one that
-- already works. Every venue a guide LINKS to (happitime.biz/kc/<area>/<slug> or
-- /v/<slug>) is collected into a companion itinerary owned by the guide's
-- author. The published guide page offers "open these spots in the app", which
-- is an ordinary /i/{share_token} link. From there the existing rails do the
-- rest: SharedItineraryScreen logs views / venue taps / saves through
-- record_itinerary_touch + copy_shared_itinerary, and the check-in trigger from
-- 20261011031500 credits the author.
--
--   1. user_lists.source_guide_id — marks a list as a guide's companion
--   2. guide_venue_slugs()        — venue slugs linked in a markdown body, in order
--   3. sync_guide_itinerary()     — create / update / retire the companion list
--   4. triggers on guides         — keep it in step with every save
--   5. get_guide_itinerary()      — public read for the guide page
--   6. backfill for guides already published
--
-- The companion list is PRIVATE with a share token (the existing convention for
-- link-shared itineraries), so it does not appear in the in-app Insider feed.
-- The author does see it among their own lists.
--
-- Only authors who are super_users get a companion: nobody else can earn touches.

-- ── 1. Mark companion lists ──────────────────────────────────────────────────
alter table public.user_lists
  add column if not exists source_guide_id uuid references public.guides(id) on delete set null;

-- One companion per guide.
create unique index if not exists user_lists_source_guide_id_key
  on public.user_lists (source_guide_id)
  where source_guide_id is not null;

-- ── 2. Which venues does a guide link to? ────────────────────────────────────
-- Matches markdown links and bare URLs to a venue page:
--   https://happitime.biz/kc/<area>/<slug>[/]   /kc/<area>/<slug>   /v/<slug>
-- Neighborhood pages (/kc/<area>/) have no slug segment and do not match.
-- Returns each slug once, in order of first appearance.
create or replace function public.guide_venue_slugs(p_body text)
returns table (slug text, ord int)
language sql
immutable
set search_path = public
as $$
  select lower(t.m[1]) as slug, min(t.ord)::int as ord
  from regexp_matches(
         coalesce(p_body, ''),
         '(?:happitime\.biz|\]\(\s*)/(?:kc/[a-z0-9-]+|v)/([a-z0-9][a-z0-9-]*)',
         'gi'
       ) with ordinality as t(m, ord)
  group by lower(t.m[1])
$$;
revoke all on function public.guide_venue_slugs(text) from public, anon, authenticated;

-- ── 3. Build, refresh or retire the companion itinerary ──────────────────────
-- A guide has a live companion only while ALL of these hold:
--   • it is published            (drafts and pending reviews are not public)
--   • its author is a super_user (only Insiders earn touches)
--   • it links at least one published venue
-- Otherwise an existing companion keeps its rows but loses its share token, so
-- the public link stops resolving and no further touches can be logged from it.
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

  return v_list_id;
end;
$$;
revoke all on function public.sync_guide_itinerary(uuid) from public, anon, authenticated;

-- ── 4. Keep it in step with the guide ────────────────────────────────────────
-- Fires on every guide write. The EXCEPTION guard means a problem here can never
-- block an author saving, or an admin publishing, a guide.
create or replace function public.guides_sync_itinerary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_guide_itinerary(new.id);
  return null;
exception when others then
  raise warning 'guides_sync_itinerary failed for guide %: %', new.id, sqlerrm;
  return null;
end;
$$;
revoke all on function public.guides_sync_itinerary() from public, anon, authenticated;

drop trigger if exists guides_sync_itinerary_trg on public.guides;
create trigger guides_sync_itinerary_trg
  after insert or update of body_md, status, title, subtitle, author_id on public.guides
  for each row execute function public.guides_sync_itinerary();

-- A deleted guide leaves its list behind (source_guide_id → null) but must not
-- leave a working public link to it.
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
exception when others then
  raise warning 'guides_retire_itinerary failed for guide %: %', old.id, sqlerrm;
  return old;
end;
$$;
revoke all on function public.guides_retire_itinerary() from public, anon, authenticated;

drop trigger if exists guides_retire_itinerary_trg on public.guides;
create trigger guides_retire_itinerary_trg
  before delete on public.guides
  for each row execute function public.guides_retire_itinerary();

-- ── 5. Public read for the guide page ────────────────────────────────────────
-- Returns the companion's share token only for a published guide, so the token
-- is exactly as public as the guide that advertises it. Null otherwise.
create or replace function public.get_guide_itinerary(p_guide_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'token', l.share_token,
    'spots', (select count(*) from public.user_list_items i where i.list_id = l.id),
    'author_handle', p.handle
  )
  from public.guides g
  join public.user_lists l on l.source_guide_id = g.id
  left join public.user_profiles p on p.user_id = l.user_id
  where g.id = p_guide_id
    and g.status = 'published'
    and l.share_token is not null;
$$;
revoke all on function public.get_guide_itinerary(uuid) from public;
grant execute on function public.get_guide_itinerary(uuid) to anon, authenticated;

-- ── 6. Backfill ──────────────────────────────────────────────────────────────
-- Guides already published get their companion now. Idempotent.
do $$
declare
  r record;
begin
  for r in select id from public.guides where status = 'published' loop
    perform public.sync_guide_itinerary(r.id);
  end loop;
end;
$$;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- drop trigger if exists guides_retire_itinerary_trg on public.guides;
-- drop trigger if exists guides_sync_itinerary_trg on public.guides;
-- drop function if exists public.get_guide_itinerary(uuid);
-- drop function if exists public.guides_retire_itinerary();
-- drop function if exists public.guides_sync_itinerary();
-- drop function if exists public.sync_guide_itinerary(uuid);
-- drop function if exists public.guide_venue_slugs(text);
-- delete from public.user_lists where source_guide_id is not null;   -- companion lists
-- drop index if exists public.user_lists_source_guide_id_key;
-- alter table public.user_lists drop column if exists source_guide_id;
