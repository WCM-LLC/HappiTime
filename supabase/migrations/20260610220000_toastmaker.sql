-- Toastmaker: ratified per-venue honor + rolling-90d scoring. user_referrals
-- already exists (Phase 5) and is REFERENCED here, not recreated.

-- Ratified Toastmaker per venue per quarter.
create table if not exists public.venue_toastmakers (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  quarter     text not null,                       -- 'YYYY-Q#'
  ratified_by uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (venue_id, quarter)
);
create index if not exists venue_toastmakers_venue_idx on public.venue_toastmakers (venue_id);

alter table public.venue_toastmakers enable row level security;
-- venue_toastmakers: world-readable for authenticated (it's a public honor); writes via RPC only.
drop policy if exists "venue_toastmakers_select_all" on public.venue_toastmakers;
create policy "venue_toastmakers_select_all" on public.venue_toastmakers for select to authenticated using (true);
grant select on public.venue_toastmakers to authenticated;

-- Per (venue, candidate) rolling-90d scoring.
create or replace view public.toastmaker_scores as
with own as (
  select c.venue_id, c.user_id, count(*) as own_checkins
  from public.checkins c
  where c.created_at > now() - interval '90 days'
  group by c.venue_id, c.user_id
),
first_visits as (   -- each referee's FIRST check-in per venue, within 90d
  select fv.venue_id, r.referrer_user_id as user_id, count(*) as attributed_first_visits
  from (
    select venue_id, user_id, min(created_at) as first_at
    from public.checkins group by venue_id, user_id
  ) fv
  join public.user_referrals r on r.referee_user_id = fv.user_id
  where fv.first_at > now() - interval '90 days'
  group by fv.venue_id, r.referrer_user_id
),
redemptions as (    -- referees' redemptions per venue within 90d
  select rr.venue_id, r.referrer_user_id as user_id, count(*) as attributed_redemptions
  from public.round_redemptions rr
  join public.user_referrals r on r.referee_user_id = rr.user_id
  where rr.created_at > now() - interval '90 days'
  group by rr.venue_id, r.referrer_user_id
)
select
  coalesce(o.venue_id, f.venue_id, d.venue_id)  as venue_id,
  coalesce(o.user_id,  f.user_id,  d.user_id)   as user_id,
  coalesce(o.own_checkins, 0)                   as own_checkins,
  coalesce(f.attributed_first_visits, 0)        as attributed_first_visits,
  coalesce(d.attributed_redemptions, 0)         as attributed_redemptions,
  coalesce(d.attributed_redemptions,0)*3 + coalesce(o.own_checkins,0)*1 as score,
  (coalesce(o.own_checkins,0) >= 6 and coalesce(f.attributed_first_visits,0) >= 3) as eligible
from own o
full join first_visits f on f.venue_id=o.venue_id and f.user_id=o.user_id
full join redemptions  d on d.venue_id=coalesce(o.venue_id,f.venue_id) and d.user_id=coalesce(o.user_id,f.user_id);

-- Top eligible nominee for a venue (org-gated read).
create or replace function public.toastmaker_nominee(p_venue_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when s.user_id is null then null else jsonb_build_object(
    'user_id', s.user_id, 'handle', p.handle, 'display_name', p.display_name,
    'own_checkins', s.own_checkins, 'attributed_first_visits', s.attributed_first_visits,
    'attributed_redemptions', s.attributed_redemptions, 'score', s.score
  ) end
  from public.toastmaker_scores s
  left join public.user_profiles p on p.user_id = s.user_id
  where s.venue_id = p_venue_id and s.eligible
    and exists (select 1 from public.venues v join public.org_members m on m.org_id=v.org_id
                where v.id = p_venue_id and m.user_id = auth.uid())   -- caller is org member
  order by s.score desc, s.own_checkins desc
  limit 1;
$$;
revoke all on function public.toastmaker_nominee(uuid) from public;
grant execute on function public.toastmaker_nominee(uuid) to authenticated;

-- GM ratifies: insert venue_toastmakers for the current quarter (org-gated).
create or replace function public.ratify_toastmaker(p_venue_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_q text := to_char(now(),'YYYY') || '-Q' || extract(quarter from now())::int;
begin
  if not exists (select 1 from public.venues v join public.org_members m on m.org_id=v.org_id
                 where v.id=p_venue_id and m.user_id=auth.uid()) then
    raise exception 'not authorized';
  end if;
  insert into public.venue_toastmakers (venue_id, user_id, quarter, ratified_by)
  values (p_venue_id, p_user_id, v_q, auth.uid())
  on conflict (venue_id, quarter) do update set user_id=excluded.user_id, ratified_by=excluded.ratified_by, created_at=now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.ratify_toastmaker(uuid, uuid) from public;
grant execute on function public.ratify_toastmaker(uuid, uuid) to authenticated;
