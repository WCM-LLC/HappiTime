-- Per-Insider rollup that needs no check-in tables (ships before Phase 1 deploys).
create or replace view public.super_user_referral_summary as
with su as (
  select user_id as super_user_id from public.user_profiles where role = 'super_user'
),
ref as (
  select referrer_user_id as super_user_id, count(*)::int as referees
  from public.user_referrals group by referrer_user_id
),
saves as (
  select super_user_id, count(*)::int as itinerary_saves
  from public.super_user_credit_events where kind = 'itinerary_save'
  group by super_user_id
)
select
  su.super_user_id,
  coalesce(ref.referees, 0)        as referees,
  coalesce(saves.itinerary_saves, 0) as itinerary_saves
from su
left join ref   on ref.super_user_id   = su.super_user_id
left join saves on saves.super_user_id = su.super_user_id;

-- Admin reads via service-role; also let an Insider read their own row.
alter view public.super_user_referral_summary set (security_invoker = on);
grant select on public.super_user_referral_summary to authenticated;
