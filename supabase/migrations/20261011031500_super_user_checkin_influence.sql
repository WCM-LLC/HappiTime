-- Super User venue-level influence attribution.
--
-- Problem: super_user_traffic_summary credits an Insider for every first check-in
-- made by anyone they RECRUITED (user_referrals), at any venue, forever. Nothing
-- records whether an Insider influenced THIS visit to THIS venue, and an existing
-- user who acts on an Insider's itinerary earns that Insider no credit at all.
--
-- This adds, in line with OPTION_B_ATTRIBUTION_SPEC.md (presence-based, in-app
-- only, no MMP, no scan logging):
--   1. super_user_venue_touches        — "user U saw venue V through Insider S"
--   2. checkin_super_user_attributions — one credit per verified check-in, stamped
--                                        by trigger at insert time
--   3. record_itinerary_touch()        — the only client write path (forge-proof)
--   4. super_user_traffic_summary      — three influence columns appended
--   5. super_user_venue_influence      — per-Insider, per-venue rollup
--
-- Attribution rule (a product decision — pinned in
-- test/super-user-checkin-influence.test.mjs):
--   • Last touch wins, inside a 7-day lookback from the check-in.
--   • No touch in the window, and this is the user's FIRST check-in at the venue,
--     and they were referred before checking in → credit the referrer.
--   • `basis` records which of the two it was, so "influenced this visit" and
--     "recruited this user" are never blurred.
--
-- Privacy: both tables are row-level presence data about OTHER users, so neither
-- is readable by the Insider. Admin-only RLS; dashboards read aggregates through
-- the service client, exactly as /dashboard/referrals already does for
-- super_user_traffic_summary.

-- ── 1. Touch log ─────────────────────────────────────────────────────────────
create table if not exists public.super_user_venue_touches (
  id             uuid primary key default gen_random_uuid(),
  super_user_id  uuid not null references auth.users(id) on delete cascade,     -- the Insider
  user_id        uuid not null references auth.users(id) on delete cascade,     -- who was influenced
  venue_id       uuid not null references public.venues(id) on delete cascade,
  kind           text not null
                   check (kind in ('itinerary_view', 'itinerary_venue_tap', 'itinerary_save')),
  subject_id     uuid,                                                          -- source user_lists.id
  created_at     timestamptz not null default now(),
  check (super_user_id <> user_id)
);

-- One row per (user, Insider, venue, kind) per UTC day: re-opening an itinerary
-- ten times is one touch, not ten. record_itinerary_touch upserts onto this key,
-- refreshing created_at so the row always carries the latest time that day.
create unique index if not exists super_user_venue_touches_daily_uidx
  on public.super_user_venue_touches
  (user_id, super_user_id, venue_id, kind, ((created_at at time zone 'utc')::date));
-- The trigger's lookup: latest touch for this user at this venue.
create index if not exists super_user_venue_touches_lookup_idx
  on public.super_user_venue_touches (user_id, venue_id, created_at desc);
create index if not exists super_user_venue_touches_su_idx
  on public.super_user_venue_touches (super_user_id, created_at desc);

alter table public.super_user_venue_touches enable row level security;
drop policy if exists "suvt_select_admin" on public.super_user_venue_touches;
create policy "suvt_select_admin" on public.super_user_venue_touches
  for select to authenticated
  using ((select public.is_happitime_admin()));
-- No client write policy: written only by record_itinerary_touch / triggers.
revoke all on public.super_user_venue_touches from anon, authenticated;
grant select on public.super_user_venue_touches to authenticated;

-- ── 2. Per-check-in credit ───────────────────────────────────────────────────
create table if not exists public.checkin_super_user_attributions (
  checkin_id        uuid primary key references public.checkins(id) on delete cascade,
  super_user_id     uuid not null references auth.users(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  venue_id          uuid not null references public.venues(id) on delete cascade,
  basis             text not null check (basis in ('venue_touch', 'referral')),
  touch_id          uuid references public.super_user_venue_touches(id) on delete set null,
  touch_kind        text,
  is_first_checkin  boolean not null,          -- user's first check-in at this venue
  checked_in_at     timestamptz not null,
  created_at        timestamptz not null default now(),
  check (super_user_id <> user_id),
  check ((basis = 'venue_touch') = (touch_kind is not null))
);
create index if not exists checkin_su_attr_su_idx
  on public.checkin_super_user_attributions (super_user_id, checked_in_at desc);
create index if not exists checkin_su_attr_venue_idx
  on public.checkin_super_user_attributions (venue_id, checked_in_at desc);

alter table public.checkin_super_user_attributions enable row level security;
drop policy if exists "csua_select_admin" on public.checkin_super_user_attributions;
create policy "csua_select_admin" on public.checkin_super_user_attributions
  for select to authenticated
  using ((select public.is_happitime_admin()));
revoke all on public.checkin_super_user_attributions from anon, authenticated;
grant select on public.checkin_super_user_attributions to authenticated;

-- ── 3. Stamp the credit when a check-in lands ────────────────────────────────
-- AFTER INSERT on checkins (written only by the verify-checkin edge function).
-- Attribution is bookkeeping: the EXCEPTION guard means a bug here can never
-- fail a guest's check-in.
create or replace function public.attribute_checkin_to_super_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window   constant interval := interval '7 days';
  v_first    boolean;
  v_touch_id uuid;
  v_su       uuid;
  v_kind     text;
begin
  v_first := not exists (
    select 1 from public.checkins c
    where c.user_id = new.user_id
      and c.venue_id = new.venue_id
      and c.id <> new.id
      and c.created_at <= new.created_at
  );

  -- Last touch inside the window, from someone who is still an Insider. Same-instant
  -- ties go to the stronger signal: save > tap > view.
  select t.id, t.super_user_id, t.kind
    into v_touch_id, v_su, v_kind
  from public.super_user_venue_touches t
  join public.user_profiles p
    on p.user_id = t.super_user_id and p.role = 'super_user'
  where t.user_id = new.user_id
    and t.venue_id = new.venue_id
    and t.created_at <= new.created_at
    and t.created_at > new.created_at - v_window
  order by t.created_at desc,
           case t.kind when 'itinerary_save' then 3
                       when 'itinerary_venue_tap' then 2
                       else 1 end desc
  limit 1;

  if v_su is not null then
    insert into public.checkin_super_user_attributions
      (checkin_id, super_user_id, user_id, venue_id, basis, touch_id, touch_kind,
       is_first_checkin, checked_in_at)
    values
      (new.id, v_su, new.user_id, new.venue_id, 'venue_touch', v_touch_id, v_kind,
       v_first, new.created_at)
    on conflict (checkin_id) do nothing;
  elsif v_first then
    -- Fallback: recruited-user credit, first check-in at this venue only
    -- (the same grain super_user_traffic_summary.first_checkins_driven counts).
    select r.referrer_user_id into v_su
    from public.user_referrals r
    where r.referee_user_id = new.user_id
      and r.created_at <= new.created_at;

    if v_su is not null then
      insert into public.checkin_super_user_attributions
        (checkin_id, super_user_id, user_id, venue_id, basis, is_first_checkin, checked_in_at)
      values
        (new.id, v_su, new.user_id, new.venue_id, 'referral', true, new.created_at)
      on conflict (checkin_id) do nothing;
    end if;
  end if;

  return null;
exception when others then
  raise warning 'attribute_checkin_to_super_user failed for checkin %: %', new.id, sqlerrm;
  return null;
end;
$$;
revoke all on function public.attribute_checkin_to_super_user() from public, anon, authenticated;

drop trigger if exists checkins_attribute_super_user on public.checkins;
create trigger checkins_attribute_super_user
  after insert on public.checkins
  for each row execute function public.attribute_checkin_to_super_user();

-- ── 4. Saves become touches with no client change ────────────────────────────
-- copy_shared_itinerary already writes one super_user_credit_events row per saved
-- Insider itinerary. Fan that out to one 'itinerary_save' touch per venue in the
-- list, rather than redefining the RPC.
create or replace function public.log_itinerary_save_touches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'itinerary_save' then
    insert into public.super_user_venue_touches
      (super_user_id, user_id, venue_id, kind, subject_id, created_at)
    select new.super_user_id, new.actor_user_id, i.venue_id, 'itinerary_save',
           new.subject_id, new.created_at
    from public.user_list_items i
    where i.list_id = new.subject_id
    on conflict do nothing;
  end if;
  return null;
exception when others then
  raise warning 'log_itinerary_save_touches failed for credit event %: %', new.id, sqlerrm;
  return null;
end;
$$;
revoke all on function public.log_itinerary_save_touches() from public, anon, authenticated;

drop trigger if exists super_user_credit_events_log_touches on public.super_user_credit_events;
create trigger super_user_credit_events_log_touches
  after insert on public.super_user_credit_events
  for each row execute function public.log_itinerary_save_touches();

-- ── 5. Client write path: views and venue taps ───────────────────────────────
-- Forge-proof in the same way as record_referral: the influenced user is ALWAYS
-- auth.uid(), and the Insider is derived from the list's owner, never passed in.
-- So a caller can only ever log their own touches, against a list they can
-- actually see, for venues that are actually in it.
--   p_venue_id null → 'itinerary_view' for every venue in the list (list opened)
--   p_venue_id set  → 'itinerary_venue_tap' for that venue
-- Returns void in every case, so it cannot be used to probe for list ids.
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
         or public.itinerary_shared_with_me(l.id));

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

-- ── 6. Rollups ───────────────────────────────────────────────────────────────
-- Existing three columns keep their exact meaning (recruited-user traffic), so no
-- number on /dashboard/referrals or /admin/users moves. Influence is appended.
create or replace view public.super_user_traffic_summary as
with first_visits as (        -- each referee's FIRST check-in per venue, credited to referrer
  select r.referrer_user_id as super_user_id,
         count(*)::int as first_checkins_driven,
         count(distinct fv.venue_id)::int as venues_touched
  from (select venue_id, user_id, min(created_at) as first_at
        from public.checkins group by venue_id, user_id) fv
  join public.user_referrals r on r.referee_user_id = fv.user_id
  group by r.referrer_user_id
),
redemptions as (
  select r.referrer_user_id as super_user_id, count(*)::int as redemptions_driven
  from public.round_redemptions rr
  join public.user_referrals r on r.referee_user_id = rr.user_id
  group by r.referrer_user_id
),
influence as (                -- check-ins that followed a venue-level touch
  select a.super_user_id,
         count(*)::int                                     as influenced_checkins,
         (count(*) filter (where a.is_first_checkin))::int as influenced_new_faces,
         count(distinct a.venue_id)::int                   as influenced_venues
  from public.checkin_super_user_attributions a
  where a.basis = 'venue_touch'
  group by a.super_user_id
)
select
  coalesce(f.super_user_id, d.super_user_id, i.super_user_id) as super_user_id,
  coalesce(f.first_checkins_driven, 0)       as first_checkins_driven,
  coalesce(f.venues_touched, 0)              as venues_touched,
  coalesce(d.redemptions_driven, 0)          as redemptions_driven,
  coalesce(i.influenced_checkins, 0)         as influenced_checkins,
  coalesce(i.influenced_new_faces, 0)        as influenced_new_faces,
  coalesce(i.influenced_venues, 0)           as influenced_venues
from first_visits f
full join redemptions d on d.super_user_id = f.super_user_id
full join influence i   on i.super_user_id = coalesce(f.super_user_id, d.super_user_id);

alter view public.super_user_traffic_summary set (security_invoker = on);
grant select on public.super_user_traffic_summary to authenticated;

-- Per-Insider, per-venue: the "this tastemaker sent you N verified check-ins" row.
create or replace view public.super_user_venue_influence as
select
  a.super_user_id,
  a.venue_id,
  (count(*) filter (where a.basis = 'venue_touch'))::int                        as influenced_checkins,
  (count(*) filter (where a.basis = 'venue_touch' and a.is_first_checkin))::int as influenced_new_faces,
  (count(*) filter (where a.basis = 'referral'))::int                           as referral_first_checkins,
  count(distinct a.user_id)::int                                                as people,
  max(a.checked_in_at)                                                          as last_checkin_at
from public.checkin_super_user_attributions a
group by a.super_user_id, a.venue_id;

alter view public.super_user_venue_influence set (security_invoker = on);
grant select on public.super_user_venue_influence to authenticated;

-- ── 7. Backfill ──────────────────────────────────────────────────────────────
-- No touches exist before this migration, so history can only be credited on the
-- referral basis: each referee's first check-in per venue, made after they were
-- referred. Idempotent.
insert into public.checkin_super_user_attributions
  (checkin_id, super_user_id, user_id, venue_id, basis, is_first_checkin, checked_in_at)
select c.id, r.referrer_user_id, c.user_id, c.venue_id, 'referral', true, c.created_at
from public.checkins c
join public.user_referrals r
  on r.referee_user_id = c.user_id
 and r.created_at <= c.created_at
where not exists (
  select 1 from public.checkins earlier
  where earlier.user_id = c.user_id
    and earlier.venue_id = c.venue_id
    and earlier.id <> c.id
    and earlier.created_at <= c.created_at
)
on conflict (checkin_id) do nothing;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- drop trigger if exists checkins_attribute_super_user on public.checkins;
-- drop trigger if exists super_user_credit_events_log_touches on public.super_user_credit_events;
-- drop function if exists public.record_itinerary_touch(uuid, uuid);
-- drop function if exists public.log_itinerary_save_touches();
-- drop function if exists public.attribute_checkin_to_super_user();
-- drop view if exists public.super_user_venue_influence;
-- (restore super_user_traffic_summary from 20260610210000 — needs DROP VIEW first,
--  CREATE OR REPLACE cannot remove columns)
-- drop table if exists public.checkin_super_user_attributions;
-- drop table if exists public.super_user_venue_touches;
