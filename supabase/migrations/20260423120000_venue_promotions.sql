-- Venue promotion tiers and Stripe subscription stubs.
-- Adds promotion_tier to venues with manual admin control,
-- plus a venue_subscriptions table for future Stripe integration.

-- ── Promotion tier on venues ─────────────────────────────────────────
-- tier values: NULL (free/none), 'basic', 'premium', 'featured'
-- priority: manual sort weight — higher = shown first (0 = default)
alter table public.venues
  add column if not exists promotion_tier text
    default null
    check (promotion_tier is null or promotion_tier in ('basic', 'premium', 'featured')),
  add column if not exists promotion_priority int not null default 0,
  add column if not exists promotion_starts_at timestamptz,
  add column if not exists promotion_ends_at timestamptz;

create index if not exists venues_promotion_tier_idx
  on public.venues (promotion_tier)
  where promotion_tier is not null;

create index if not exists venues_promotion_priority_idx
  on public.venues (promotion_priority desc, name asc);

-- ── Venue subscriptions (Stripe stubs) ───────────────────────────────
-- One row per venue subscription. stripe_* columns are null until
-- Stripe is wired up; the admin panel uses promotion_tier on venues
-- as the source of truth for display/sorting until then.
create table if not exists public.venue_subscriptions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Plan details
  plan text not null default 'free'
    check (plan in ('free', 'basic', 'premium', 'featured')),
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled', 'trialing', 'paused')),

  -- Stripe stubs (null until integration)
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_current_period_start timestamptz,
  stripe_current_period_end timestamptz,

  -- Billing metadata
  billing_email text,
  billing_name text,

  -- Manual override (admin can force a tier regardless of Stripe)
  manual_override boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One active subscription per venue
  unique (venue_id)
);

create index if not exists venue_subscriptions_org_idx
  on public.venue_subscriptions (org_id);

create index if not exists venue_subscriptions_stripe_cust_idx
  on public.venue_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists venue_subscriptions_stripe_sub_idx
  on public.venue_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Updated-at trigger
drop trigger if exists venue_subscriptions_updated_at on public.venue_subscriptions;
create trigger venue_subscriptions_updated_at
  before update on public.venue_subscriptions
  for each row execute function public.set_updated_at();

-- ── Convenience view: active promoted venues ─────────────────────────
create or replace view public.promoted_venues as
select
  v.id,
  v.name,
  v.org_id,
  v.promotion_tier,
  v.promotion_priority,
  v.promotion_starts_at,
  v.promotion_ends_at,
  vs.plan as subscription_plan,
  vs.status as subscription_status,
  vs.stripe_subscription_id
from public.venues v
left join public.venue_subscriptions vs on vs.venue_id = v.id
where v.promotion_tier is not null
  and v.status = 'published'
  and (v.promotion_starts_at is null or v.promotion_starts_at <= now())
  and (v.promotion_ends_at is null or v.promotion_ends_at > now())
order by v.promotion_priority desc, v.name asc;
