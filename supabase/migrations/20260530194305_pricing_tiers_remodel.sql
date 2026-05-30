-- Remodel venue/org subscription tier vocabulary to the freemium + bundle model.
-- Per-venue tiers: listed (free) / verified ($49) / featured ($99) / founding_pilot ($49, time-limited).
-- Org-level bundles (org_subscriptions): bundle_2_4 ($79/venue) / bundle_5_plus ($59/venue).
--
-- Live state at authoring (project ujflcrjsiyhofnomurco): venue_subscriptions = 0 rows;
-- all 165 venues have promotion_tier = NULL. The data UPDATEs below are therefore no-ops
-- today but keep the migration correct if rows exist when it is replayed elsewhere.
--
-- Applied to remote via Supabase MCP apply_migration (name: pricing_tiers_remodel).

-- 1. venue_subscriptions.plan : prune duplicate CHECKs, adopt new vocabulary, default 'listed'.
alter table public.venue_subscriptions
  drop constraint if exists venue_subscriptions_plan_check,
  drop constraint if exists venue_subscriptions_plan_check1;

update public.venue_subscriptions set plan = case plan
    when 'free'    then 'listed'
    when 'basic'   then 'verified'
    when 'premium' then 'featured'
    else plan end;

alter table public.venue_subscriptions alter column plan set default 'listed';
alter table public.venue_subscriptions
  add constraint venue_subscriptions_plan_check
    check (plan in ('listed','verified','featured','founding_pilot'));

-- status : add 'pilot'
alter table public.venue_subscriptions drop constraint if exists venue_subscriptions_status_check;
alter table public.venue_subscriptions
  add constraint venue_subscriptions_status_check
    check (status in ('active','past_due','canceled','trialing','paused','pilot'));

-- new columns (nullable: webhook/admin upserts do not populate them; rate is derivable from tier)
alter table public.venue_subscriptions
  add column if not exists monthly_rate_cents integer,
  add column if not exists founding_pilot_until timestamptz;

-- 2. venues.promotion_tier : adopt new vocabulary (this column is the effective display tier).
update public.venues set promotion_tier = case promotion_tier
    when 'basic'   then 'verified'
    when 'premium' then 'featured'
    else promotion_tier end
  where promotion_tier is not null;

alter table public.venues drop constraint if exists venues_promotion_tier_check;
alter table public.venues
  add constraint venues_promotion_tier_check
    check (promotion_tier is null
           or promotion_tier in ('verified','featured','founding_pilot','bundle_2_4','bundle_5_plus'));

-- 3. org_subscriptions : org-level bundle billing (Stripe scaffold only; service-role writes).
create table if not exists public.org_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bundle_tier text not null check (bundle_tier in ('bundle_2_4','bundle_5_plus')),
  monthly_rate_per_venue_cents integer not null,
  venue_count integer not null default 0,
  annual_commit boolean not null default false,
  status text not null default 'active'
    check (status in ('active','past_due','canceled','trialing','paused','pilot')),
  started_at timestamptz,
  current_period_end timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);
create index if not exists org_subscriptions_org_idx on public.org_subscriptions (org_id);

drop trigger if exists org_subscriptions_set_updated_at on public.org_subscriptions;
create trigger org_subscriptions_set_updated_at
  before update on public.org_subscriptions
  for each row execute function public.set_updated_at();

alter table public.org_subscriptions enable row level security;
drop policy if exists "org_subscriptions_select_org_member" on public.org_subscriptions;
create policy "org_subscriptions_select_org_member"
  on public.org_subscriptions for select to authenticated
  using (exists (
    select 1 from public.org_members om
    where om.org_id = org_subscriptions.org_id and om.user_id = auth.uid()
  ));
grant select on public.org_subscriptions to authenticated;
-- writes: service role only (bypasses RLS); no write policy granted to anon/authenticated.

-- 4. v_venue_active_tier : public-safe (venue_id, tier) projection. security_invoker honors
-- venues RLS (anon sees published only) and exposes no financial columns.
drop view if exists public.v_venue_active_tier;
create view public.v_venue_active_tier with (security_invoker = true) as
  select v.id as venue_id, coalesce(v.promotion_tier, 'listed') as tier
  from public.venues v;
grant select on public.v_venue_active_tier to anon, authenticated;

-- ── DOWN (manual rollback) ───────────────────────────────────────────────────
-- drop view if exists public.v_venue_active_tier;
-- drop table if exists public.org_subscriptions cascade;
-- alter table public.venue_subscriptions
--   drop column if exists founding_pilot_until,
--   drop column if exists monthly_rate_cents;
-- alter table public.venue_subscriptions drop constraint if exists venue_subscriptions_status_check;
-- alter table public.venue_subscriptions add constraint venue_subscriptions_status_check
--   check (status in ('active','past_due','canceled','trialing','paused'));
-- alter table public.venue_subscriptions drop constraint if exists venue_subscriptions_plan_check;
-- update public.venue_subscriptions set plan = case plan when 'listed' then 'free'
--   when 'verified' then 'basic' else plan end;
-- alter table public.venue_subscriptions alter column plan set default 'free';
-- alter table public.venue_subscriptions add constraint venue_subscriptions_plan_check
--   check (plan in ('free','basic','premium','featured'));
-- alter table public.venues drop constraint if exists venues_promotion_tier_check;
-- update public.venues set promotion_tier = case promotion_tier when 'verified' then 'basic' else promotion_tier end where promotion_tier is not null;
-- alter table public.venues add constraint venues_promotion_tier_check
--   check (promotion_tier is null or promotion_tier in ('basic','premium','featured'));
