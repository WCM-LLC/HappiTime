-- Per-Insider venue-traffic rollup: first check-ins driven, distinct venues
-- touched, and round redemptions by each Insider's referees. Promoted from
-- supabase/deferred/ now that Pilot Phase 1 (public.checkins / public.round_redemptions)
-- is on master. The Super Admin console (apps/web/src/app/admin/users) reads this
-- view (guarded) to populate the traffic columns.
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
)
select
  coalesce(f.super_user_id, d.super_user_id) as super_user_id,
  coalesce(f.first_checkins_driven, 0)       as first_checkins_driven,
  coalesce(f.venues_touched, 0)              as venues_touched,
  coalesce(d.redemptions_driven, 0)          as redemptions_driven
from first_visits f
full join redemptions d on d.super_user_id = f.super_user_id;

alter view public.super_user_traffic_summary set (security_invoker = on);
grant select on public.super_user_traffic_summary to authenticated;
