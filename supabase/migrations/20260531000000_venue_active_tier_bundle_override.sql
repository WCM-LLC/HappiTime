-- Phase 4 (sub-project 1, read path): fold the active org-bundle override into
-- v_venue_active_tier. An org with an active bundle subscription elevates all of
-- its venues to featured-level display.
--
-- The view shipped in 20260530194305_pricing_tiers_remodel.sql as a deliberate
-- placeholder: coalesce(promotion_tier,'listed'). This restores the org-bundle
-- override the approved design called for.
--
-- VERIFIED NO-OP TODAY: org_subscriptions has 0 rows, so the override yields
-- nothing and the output is byte-identical to the prior COALESCE for every venue.
-- It lights up when bundle billing (sub-project 2) sells the first bundle.
--
-- ANON-SAFETY (the reason this is a definer function, not a plain join):
-- the directory queries this view as the anon role. org_subscriptions is granted
-- to `authenticated` only and its RLS policy covers org members, so a plain
-- `left join public.org_subscriptions` under security_invoker would silently
-- return zero rows for anon -- the override would never reach the public site.
-- We instead read the bundle through a SECURITY DEFINER function that returns
-- ONLY the bundle_tier (never rates / Stripe ids), executable by anon. The view
-- stays security_invoker = true so the venues RLS (anon sees published only)
-- and the no-financial-columns guarantee are both preserved.
--
-- Effective tier = max(own tier, bundle -> featured):
--   * a venue with its own featured/bundle_* keeps that value (never relabeled);
--   * else an active bundle yields its bundle_tier (bundle_2_4 / bundle_5_plus),
--     which tierVariant already maps to the featured variant;
--   * else coalesce(promotion_tier,'listed') -- unchanged from before.
--
-- "Active bundle" = status only (active / trialing / pilot), mirroring the
-- per-venue flow which trusts Stripe-driven status and never gates on period
-- dates. current_period_end stays informational.
--
-- Applied to remote via Supabase MCP (name: venue_active_tier_bundle_override).

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
--   select v.id as venue_id, coalesce(v.promotion_tier, 'listed') as tier
--   from public.venues v;
-- grant select on public.v_venue_active_tier to anon, authenticated;
-- drop function if exists public.org_active_bundle_tier(uuid);
