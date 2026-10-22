-- Super User Home + Metrics: one server-side read for everything the console
-- shows, plus the venue-side "guides sending you people" read.
--
-- Spec: SUPER-USER-HOME-AND-METRICS-SPEC-2026-10-22.md (Phases 1–5).
--
-- Design:
--   • No new attribution path. Guide → venue influence already flows through the
--     guide's companion itinerary (20261011041500): the app logs itinerary_view /
--     itinerary_venue_tap / itinerary_save touches with subject_id = the companion
--     list, and the check-in trigger (20261011031500) credits the author. A guide's
--     "people sent" is therefore: attributions whose touch's subject_id is the
--     list with source_guide_id = guide. Nothing here touches the trigger or the
--     touches table.
--   • Views / clicks / scans are read from directory_events (anonymous web) and
--     user_events (signed-in app), tagged with meta.guide_id / meta.referrer_handle
--     by the pages that write them (directory PageTracker / TrackedLink, mobile
--     Guides screens, /r/[handle]).
--   • directory_events is RLS-restricted to service_role for reads, so these are
--     SECURITY DEFINER functions that scope strictly to the caller: a Super User
--     sees only their own numbers; admins may pass another Super User's id;
--     venue owners see only their own venues.
--   • Everything is computed on read — no cron, no materialization. Volumes are
--     tiny (6k directory_events, 13 check-ins) and will be for a long time.
--
-- Idempotent: safe to re-run (create or replace / if not exists only).

-- ── Indexes for the event lookups ──────────────────────────────────────────────
create index if not exists directory_events_guide_id_idx
  on public.directory_events ((meta->>'guide_id'), created_at)
  where meta ? 'guide_id';

create index if not exists directory_events_referrer_handle_idx
  on public.directory_events ((meta->>'referrer_handle'), created_at)
  where meta ? 'referrer_handle';

create index if not exists user_events_guide_id_idx
  on public.user_events ((meta->>'guide_id'), created_at)
  where meta ? 'guide_id';

-- ── Super User metrics ─────────────────────────────────────────────────────────
-- p_days: window length (7 / 28 / 90); null or <= 0 = all time (prior window is
-- then empty and deltas are null). p_super_user_id: admins only; others get
-- their own id regardless of what they pass.
create or replace function public.super_user_metrics(
  p_days          int  default 28,
  p_super_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller  uuid := auth.uid();
  v_su      uuid;
  v_handle  text;
  v_all     boolean := (p_days is null or p_days <= 0);
  v_win     interval := make_interval(days => greatest(coalesce(p_days, 0), 0));
  v_now     timestamptz := now();
  v_start   timestamptz;   -- current window start (null = all time)
  v_pstart  timestamptz;   -- prior window start
  v_out     jsonb;
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;

  if p_super_user_id is not null and p_super_user_id <> v_caller then
    if not public.is_happitime_admin() then
      raise exception 'not authorized';
    end if;
    v_su := p_super_user_id;
  else
    v_su := v_caller;
  end if;

  select p.handle into v_handle from public.user_profiles p where p.user_id = v_su;

  if not v_all then
    v_start  := v_now - v_win;
    v_pstart := v_start - v_win;
  end if;

  with
  -- Attributed check-ins (both bases) for this Super User
  attr as (
    select a.*
    from public.checkin_super_user_attributions a
    where a.super_user_id = v_su
  ),
  attr_cur as (select * from attr where v_all or checked_in_at >= v_start),
  attr_pri as (select * from attr where not v_all and checked_in_at >= v_pstart and checked_in_at < v_start),

  -- Companion itineraries of this author's guides → guide_id per touch
  companions as (
    select l.id as list_id, l.source_guide_id as guide_id
    from public.user_lists l
    join public.guides g on g.id = l.source_guide_id
    where g.author_id = v_su
  ),
  guide_attr as (
    select a.checkin_id, a.checked_in_at, a.is_first_checkin, a.venue_id, c.guide_id
    from attr a
    join public.super_user_venue_touches t on t.id = a.touch_id
    join companions c on c.list_id = t.subject_id
  ),

  -- Guide events: web (directory_events) ∪ app (user_events)
  gev as (
    select (e.meta->>'guide_id')::uuid as guide_id,
           case when e.event_type = 'page_view' then 'view'
                when e.event_type = 'cta_click' and e.meta->>'cta' = 'guide_venue' then 'venue_click'
                else null end as kind,
           e.session_id as sess, e.created_at
    from public.directory_events e
    where e.meta ? 'guide_id'
    union all
    select (u.meta->>'guide_id')::uuid,
           case when u.event_type = 'guide_view' then 'view'
                when u.event_type = 'guide_venue_click' then 'venue_click'
                else null end,
           u.user_id::text, u.created_at
    from public.user_events u
    where u.meta ? 'guide_id'
  ),
  my_guides as (
    select g.id, g.slug, g.title, g.status, g.cover_image_url, g.published_at, g.updated_at
    from public.guides g where g.author_id = v_su
  ),
  gstats as (
    select g.id, g.slug, g.title, g.status, g.cover_image_url, g.published_at, g.updated_at,
      count(*) filter (where e.kind = 'view' and (v_all or e.created_at >= v_start))                                   as views,
      count(*) filter (where e.kind = 'view' and not v_all and e.created_at >= v_pstart and e.created_at < v_start)   as views_prior,
      count(*) filter (where e.kind = 'view')                                                                           as views_all,
      count(distinct e.sess) filter (where e.kind = 'view' and (v_all or e.created_at >= v_start))                     as sessions,
      count(*) filter (where e.kind = 'venue_click' and (v_all or e.created_at >= v_start))                            as venue_clicks,
      count(*) filter (where e.kind = 'venue_click' and not v_all and e.created_at >= v_pstart and e.created_at < v_start) as venue_clicks_prior,
      min(e.created_at) filter (where e.kind = 'view')                                                                 as first_tracked_at,
      (select count(*) from guide_attr ga where ga.guide_id = g.id and (v_all or ga.checked_in_at >= v_start))         as people_sent,
      (select count(*) from guide_attr ga where ga.guide_id = g.id and not v_all and ga.checked_in_at >= v_pstart and ga.checked_in_at < v_start) as people_sent_prior,
      (select count(*) from guide_attr ga where ga.guide_id = g.id)                                                    as people_sent_all
    from my_guides g
    left join gev e on e.guide_id = g.id and e.kind is not null
    group by g.id, g.slug, g.title, g.status, g.cover_image_url, g.published_at, g.updated_at
  ),

  -- Referrals
  refs as (
    select r.* from public.user_referrals r where r.referrer_user_id = v_su
  ),
  ref_first_checkins as (
    -- referees who have checked in anywhere at least once
    select r.referee_user_id, min(c.created_at) as first_at
    from refs r join public.checkins c on c.user_id = r.referee_user_id
    group by r.referee_user_id
  ),
  scans as (
    select e.created_at, e.session_id
    from public.directory_events e
    where e.event_type = 'page_view'
      and v_handle is not null
      and (e.meta->>'referrer_handle' = v_handle
           or e.page_path = '/r/' || v_handle || '/'
           or e.page_path = '/r/' || v_handle)
  ),
  saves as (
    select c.created_at from public.super_user_credit_events c
    where c.super_user_id = v_su and c.kind = 'itinerary_save'
  ),
  redemptions as (
    select rr.created_at
    from public.round_redemptions rr
    join refs r on r.referee_user_id = rr.user_id
  ),

  -- Daily series for the window (or last 90 days when all-time)
  days as (
    select d::date as day
    from generate_series(
      (coalesce(v_start, v_now - interval '90 days'))::date,
      v_now::date, interval '1 day') d
  ),
  daily as (
    select d.day,
      (select count(*) from attr a where a.checked_in_at::date = d.day)                                   as people_sent,
      (select count(*) from gev e join my_guides g on g.id = e.guide_id where e.kind = 'view' and e.created_at::date = d.day) as guide_views,
      (select count(*) from scans s where s.created_at::date = d.day)                                     as qr_scans,
      (select count(*) from refs r where r.created_at::date = d.day)                                      as referrals
    from days d
    order by d.day
  )

  select jsonb_build_object(
    'super_user_id', v_su,
    'handle', v_handle,
    'range_days', case when v_all then null else p_days end,
    'window_start', v_start,
    'window_end', v_now,
    'tracking_since', (select min(created_at) from gev),

    'influence', jsonb_build_object(
      'people_sent',        (select count(*) from attr_cur),
      'people_sent_prior',  case when v_all then null else (select count(*) from attr_pri) end,
      'people_sent_all',    (select count(*) from attr),
      'new_faces',          (select count(*) filter (where is_first_checkin) from attr_cur),
      'new_faces_prior',    case when v_all then null else (select count(*) filter (where is_first_checkin) from attr_pri) end,
      'venues_moved',       (select count(distinct venue_id) from attr_cur),
      'venues_moved_prior', case when v_all then null else (select count(distinct venue_id) from attr_pri) end,
      'venues_moved_all',   (select count(distinct venue_id) from attr),
      'redemptions',        (select count(*) from redemptions where v_all or created_at >= v_start),
      'redemptions_prior',  case when v_all then null else (select count(*) from redemptions where created_at >= v_pstart and created_at < v_start) end,
      'venues_touched',     (select count(distinct t.venue_id) from public.super_user_venue_touches t where t.super_user_id = v_su and (v_all or t.created_at >= v_start)),
      'venues', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'venue_id', x.venue_id, 'name', v.name, 'slug', v.slug, 'neighborhood', v.neighborhood,
                 'people_sent', x.n, 'new_faces', x.nf, 'last_checkin_at', x.last_at)
               order by x.n desc, x.last_at desc)
        from (select a.venue_id, count(*) n, count(*) filter (where a.is_first_checkin) nf, max(a.checked_in_at) last_at
              from attr_cur a group by a.venue_id) x
        join public.venues v on v.id = x.venue_id
      ), '[]'::jsonb)
    ),

    'guides', jsonb_build_object(
      'published_count', (select count(*) from my_guides where status = 'published'),
      'draft_count',     (select count(*) from my_guides where status <> 'published'),
      'views',           (select coalesce(sum(views), 0) from gstats),
      'views_prior',     case when v_all then null else (select coalesce(sum(views_prior), 0) from gstats) end,
      'views_all',       (select coalesce(sum(views_all), 0) from gstats),
      'venue_clicks',    (select coalesce(sum(venue_clicks), 0) from gstats),
      'venue_clicks_prior', case when v_all then null else (select coalesce(sum(venue_clicks_prior), 0) from gstats) end,
      'people_sent',     (select coalesce(sum(people_sent), 0) from gstats),
      'people_sent_prior', case when v_all then null else (select coalesce(sum(people_sent_prior), 0) from gstats) end,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'guide_id', s.id, 'slug', s.slug, 'title', s.title, 'status', s.status,
                 'cover_image_url', s.cover_image_url, 'published_at', s.published_at, 'updated_at', s.updated_at,
                 'views', s.views, 'views_prior', case when v_all then null else s.views_prior end, 'views_all', s.views_all,
                 'sessions', s.sessions,
                 'venue_clicks', s.venue_clicks, 'venue_clicks_prior', case when v_all then null else s.venue_clicks_prior end,
                 'ctr', case when s.views >= 20 then round(s.venue_clicks::numeric / s.views, 4) else null end,
                 'people_sent', s.people_sent, 'people_sent_prior', case when v_all then null else s.people_sent_prior end,
                 'people_sent_all', s.people_sent_all,
                 'first_tracked_at', s.first_tracked_at,
                 'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'views', (
                              select count(*) from gev e where e.guide_id = s.id and e.kind = 'view' and e.created_at::date = d.day)) order by d.day), '[]'::jsonb)
                           from days d),
                 'venues', coalesce((
                   select jsonb_agg(jsonb_build_object('venue_id', y.venue_id, 'name', v.name, 'people_sent', y.n) order by y.n desc)
                   from (select ga.venue_id, count(*) n from guide_attr ga where ga.guide_id = s.id and (v_all or ga.checked_in_at >= v_start) group by ga.venue_id) y
                   join public.venues v on v.id = y.venue_id
                 ), '[]'::jsonb))
               order by (s.status = 'published') desc, s.views desc, s.published_at desc nulls last)
        from gstats s
      ), '[]'::jsonb)
    ),

    'referrals', jsonb_build_object(
      'joined',          (select count(*) from refs where v_all or created_at >= v_start),
      'joined_prior',    case when v_all then null else (select count(*) from refs where created_at >= v_pstart and created_at < v_start) end,
      'joined_all',      (select count(*) from refs),
      'qr_scans',        (select count(*) from scans where v_all or created_at >= v_start),
      'qr_scans_prior',  case when v_all then null else (select count(*) from scans where created_at >= v_pstart and created_at < v_start) end,
      'qr_scans_all',    (select count(*) from scans),
      'first_checkins',  (select count(*) from ref_first_checkins where v_all or first_at >= v_start),
      'first_checkins_all', (select count(*) from ref_first_checkins),
      'itinerary_saves', (select count(*) from saves where v_all or created_at >= v_start),
      'itinerary_saves_all', (select count(*) from saves),
      'weekly', coalesce((
        select jsonb_agg(jsonb_build_object('week_start', w.ws, 'scans', w.sc, 'joined', w.jn) order by w.ws)
        from (
          select date_trunc('week', d.day)::date ws,
                 sum(d.qr_scans) sc, sum(d.referrals) jn
          from daily d group by 1
        ) w
      ), '[]'::jsonb)
    ),

    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                'day', d.day, 'people_sent', d.people_sent, 'guide_views', d.guide_views,
                'qr_scans', d.qr_scans, 'referrals', d.referrals) order by d.day), '[]'::jsonb)
              from daily d),

    'totals', jsonb_build_object(
      'people_sent', (select count(*) from attr),
      'new_faces',   (select count(*) filter (where is_first_checkin) from attr),
      'venues_moved', (select count(distinct venue_id) from attr),
      'guide_views', (select coalesce(sum(views_all), 0) from gstats),
      'referrals',   (select count(*) from refs),
      'qr_scans',    (select count(*) from scans),
      'guides_published', (select count(*) from my_guides where status = 'published'),
      'first_people_sent_at', (select min(checked_in_at) from attr),
      'first_guide_published_at', (select min(published_at) from my_guides where status = 'published')
    )
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.super_user_metrics(int, uuid) from public, anon;
grant execute on function public.super_user_metrics(int, uuid) to authenticated;

comment on function public.super_user_metrics(int, uuid) is
  'Everything the Super User Home and /dashboard/metrics show, scoped to the caller (admins may pass another Super User). Computed on read.';

-- ── Venue-side: guides sending this venue people ───────────────────────────────
create or replace function public.venue_guide_stats(
  p_venue_id uuid,
  p_days     int default 28
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_org    uuid;
  v_all    boolean := (p_days is null or p_days <= 0);
  v_start  timestamptz;
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;

  select v.org_id into v_org from public.venues v where v.id = p_venue_id;
  if v_org is null then
    return '[]'::jsonb;
  end if;
  if not (public.is_happitime_admin() or public.is_org_member(v_org)) then
    raise exception 'not authorized';
  end if;

  if not v_all then
    v_start := now() - make_interval(days => p_days);
  end if;

  return coalesce((
    with
    -- Guides that link this venue (via their companion itinerary) …
    linked as (
      select l.source_guide_id as guide_id, l.id as list_id
      from public.user_lists l
      join public.user_list_items i on i.list_id = l.id and i.venue_id = p_venue_id
      where l.source_guide_id is not null
    ),
    -- … or that sent a web click to it
    clicks as (
      select (e.meta->>'guide_id')::uuid as guide_id, e.created_at
      from public.directory_events e
      where e.event_type = 'cta_click' and e.meta->>'cta' = 'guide_venue'
        and e.venue_id = p_venue_id and e.meta ? 'guide_id'
      union all
      select (u.meta->>'guide_id')::uuid, u.created_at
      from public.user_events u
      where u.event_type = 'guide_venue_click' and u.venue_id = p_venue_id and u.meta ? 'guide_id'
    ),
    sent as (
      select ln.guide_id, a.checked_in_at
      from public.checkin_super_user_attributions a
      join public.super_user_venue_touches t on t.id = a.touch_id
      join linked ln on ln.list_id = t.subject_id
      where a.venue_id = p_venue_id
    ),
    guide_ids as (
      select guide_id from linked
      union select guide_id from clicks
    )
    select jsonb_agg(jsonb_build_object(
             'guide_id', g.id, 'slug', g.slug, 'title', g.title,
             'author_handle', p.handle, 'author_name', coalesce(p.display_name, p.handle),
             'venue_clicks', (select count(*) from clicks c where c.guide_id = g.id and (v_all or c.created_at >= v_start)),
             'people_sent',  (select count(*) from sent s where s.guide_id = g.id and (v_all or s.checked_in_at >= v_start)),
             'first_seen_at', least((select min(created_at) from clicks c where c.guide_id = g.id),
                                    (select min(checked_in_at) from sent s where s.guide_id = g.id)),
             'last_seen_at',  greatest((select max(created_at) from clicks c where c.guide_id = g.id),
                                       (select max(checked_in_at) from sent s where s.guide_id = g.id)))
           order by (select count(*) from sent s where s.guide_id = g.id and (v_all or s.checked_in_at >= v_start)) desc,
                    (select count(*) from clicks c where c.guide_id = g.id and (v_all or c.created_at >= v_start)) desc)
    from guide_ids gi
    join public.guides g on g.id = gi.guide_id and g.status = 'published'
    left join public.user_profiles p on p.user_id = g.author_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.venue_guide_stats(uuid, int) from public, anon;
grant execute on function public.venue_guide_stats(uuid, int) to authenticated;

comment on function public.venue_guide_stats(uuid, int) is
  'Guides that sent a venue clicks or attributed check-ins, for the venue owner''s dashboard. Org members and admins only.';
