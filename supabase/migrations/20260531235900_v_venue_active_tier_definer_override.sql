-- Forward fix: replace the plain-join v_venue_active_tier (shipped in
-- 20260531041653_venue_active_tier_bundle_override.sql) with the anon-safe
-- SECURITY DEFINER version the app code + tests were built around.
--
-- WHY: under security_invoker the anon role (public directory) cannot read
-- public.org_subscriptions (granted to authenticated only, member-scoped RLS), so the
-- plain `left join org_subscriptions` returns zero rows for anon and the bundle override
-- never elevates a venue on the public site. We instead read the bundle through a
-- SECURITY DEFINER function that returns ONLY the bundle_tier (never rates / Stripe ids),
-- executable by anon. The view stays security_invoker = true so the venues RLS (anon sees
-- published only) and the no-financial-columns guarantee are both preserved.
--
-- VERIFIED NO-OP AT AUTHORING: org_subscriptions has 0 rows, so output is byte-identical
-- to the prior plain-join view for every venue. It lights up when the first bundle sells.

-- 1. Definer-side bundle lookup. Owner-executed so it can read org_subscriptions
--    regardless of caller RLS/grants; returns only the bundle tier text.
create or replace function public.org_active_bundle_tier(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select os.bundle_tier
  from public.org_subscriptions os
  where os.org_id = p_org_id
    and os.status in ('active','trialing','pilot')
  limit 1;
$$;

revoke all on function public.org_active_bundle_tier(uuid) from public;
grant execute on function public.org_active_bundle_tier(uuid) to anon, authenticated;

-- 2. The view. security_invoker = true keeps venues RLS (anon = published only)
--    and exposes no financial columns -- only (venue_id, tier).
drop view if exists public.v_venue_active_tier;
create view public.v_venue_active_tier with (security_invoker = true) as
  select v.id as venue_id,
    case
      when v.promotion_tier in ('featured','bundle_2_4','bundle_5_plus')
        then v.promotion_tier                  -- self-paid featured-level wins, unchanged
      when b.bundle_tier is not null
        then b.bundle_tier                     -- active bundle elevates to featured-level
      else coalesce(v.promotion_tier, 'listed')
    end as tier
  from public.venues v
  left join lateral (
    select public.org_active_bundle_tier(v.org_id) as bundle_tier
  ) b on true;
grant select on public.v_venue_active_tier to anon, authenticated;

-- ── DOWN (manual rollback) ───────────────────────────────────────────────────
-- drop view if exists public.v_venue_active_tier;
-- create view public.v_venue_active_tier with (security_invoker = true) as
--   select v.id as venue_id,
--     case
--       when v.promotion_tier in ('featured','bundle_2_4','bundle_5_plus')
--         then v.promotion_tier
--       when os.org_id is not null then os.bundle_tier
--       else coalesce(v.promotion_tier, 'listed')
--     end as tier
--   from public.venues v
--   left join public.org_subscriptions os
--     on os.org_id = v.org_id and os.status in ('active','trialing','pilot');
-- grant select on public.v_venue_active_tier to anon, authenticated;
-- drop function if exists public.org_active_bundle_tier(uuid);
