-- Reconciled to mirror what actually ran on prod (remote ledger version 20260531041653).
--
-- IMPORTANT: this is the *plain-join* version that is live on prod. The repo briefly
-- carried a newer SECURITY DEFINER rewrite (org_active_bundle_tier()) under the old
-- filename 20260531000000 that was NEVER applied to prod; that fix is preserved in git
-- history and tracked for a forward migration. Do not silently re-add it here — the
-- repo must replay to the exact schema prod is running.
--
-- KNOWN LIMITATION (the reason the definer rewrite exists): under security_invoker the
-- anon role (public directory) cannot read public.org_subscriptions (granted to
-- authenticated only, member-scoped RLS), so the `left join org_subscriptions` yields
-- zero rows for anon and the bundle override never elevates a venue on the public site.
-- This is a latent no-op today (org_subscriptions has 0 rows) and lights up only once
-- the first bundle is sold; the forward definer migration must land before then.
--
-- Fold the active org-bundle override into v_venue_active_tier: an org with an active
-- bundle subscription elevates all of its venues to featured-level display.

drop view if exists public.v_venue_active_tier;
create view public.v_venue_active_tier with (security_invoker = true) as
  select v.id as venue_id,
    case
      when v.promotion_tier in ('featured','bundle_2_4','bundle_5_plus')
        then v.promotion_tier
      when os.org_id is not null then os.bundle_tier
      else coalesce(v.promotion_tier, 'listed')
    end as tier
  from public.venues v
  left join public.org_subscriptions os
    on os.org_id = v.org_id
    and os.status in ('active','trialing','pilot');
grant select on public.v_venue_active_tier to anon, authenticated;
