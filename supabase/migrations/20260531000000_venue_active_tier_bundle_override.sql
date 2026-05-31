-- Phase 4 (sub-project 1, read path): fold the active org-bundle override into
-- v_venue_active_tier. An org with an active bundle subscription elevates all of
-- its venues to featured-level display.
--
-- The view shipped in 20260530194305_pricing_tiers_remodel.sql as a deliberate
-- placeholder: coalesce(promotion_tier,'listed'). This restores the LEFT JOIN
-- org_subscriptions the approved design called for.
--
-- VERIFIED NO-OP TODAY: org_subscriptions has 0 rows, so the LEFT JOIN matches
-- nothing and the output is byte-identical to the prior COALESCE for every venue.
-- It lights up when bundle billing (sub-project 2) sells the first bundle.
--
-- Effective tier = max(own tier, bundle -> featured):
--   * a venue with its own featured/bundle_* keeps that value (never relabeled);
--   * else an active bundle yields os.bundle_tier (bundle_2_4 / bundle_5_plus),
--     which tierVariant already maps to the featured variant;
--   * else coalesce(promotion_tier,'listed') -- unchanged from before.
--
-- "Active bundle" = status only (active / trialing / pilot), mirroring the
-- per-venue flow which trusts Stripe-driven status and never gates on period
-- dates. current_period_end stays informational.
--
-- security_invoker = true is preserved: the view honors venues RLS (anon sees
-- published only) and exposes no financial columns -- only (venue_id, tier). The
-- org_subscriptions join reads only org_id / status / bundle_tier, never rates.
--
-- Applied to remote via Supabase MCP apply_migration (name:
-- venue_active_tier_bundle_override).

drop view if exists public.v_venue_active_tier;
create view public.v_venue_active_tier with (security_invoker = true) as
  select v.id as venue_id,
    case
      when v.promotion_tier in ('featured','bundle_2_4','bundle_5_plus')
        then v.promotion_tier                          -- self-paid featured-level wins, unchanged
      when os.org_id is not null then os.bundle_tier    -- active bundle elevates to featured-level
      else coalesce(v.promotion_tier, 'listed')
    end as tier
  from public.venues v
  left join public.org_subscriptions os
    on os.org_id = v.org_id
    and os.status in ('active','trialing','pilot');
grant select on public.v_venue_active_tier to anon, authenticated;

-- ── DOWN (manual rollback) ───────────────────────────────────────────────────
-- drop view if exists public.v_venue_active_tier;
-- create view public.v_venue_active_tier with (security_invoker = true) as
--   select v.id as venue_id, coalesce(v.promotion_tier, 'listed') as tier
--   from public.venues v;
-- grant select on public.v_venue_active_tier to anon, authenticated;
