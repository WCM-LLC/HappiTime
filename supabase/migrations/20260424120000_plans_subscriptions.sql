-- Plans & subscriptions: schema foundation for future tier enforcement.
-- Helpers are fail-open: a missing record always means 'free' plan.
-- No existing behaviour changes — every current venue/user defaults to 'free'.
--
-- Venue plans:
--   free     — default for all existing venues
--   pro      — single-venue paid tier (custom loyalty, extended analytics)
--   business — multi-venue paid tier (segmentation, unlimited media)
--
-- Consumer plans:
--   free     — default for all existing users
--   power    — paid tier (unlimited favorites; other features TBD)
--
-- Explicitly FREE for all users regardless of plan (do not gate these):
--   • Shared / public itineraries (is_shared: true) — drives virality
--   • Group check-in                                — drives social engagement

-- ── venue_subscriptions ──────────────────────────────────────────────────────

create table if not exists public.venue_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  venue_id   uuid        not null references public.venues(id) on delete cascade,
  plan       text        not null default 'free'
               check (plan   in ('free', 'pro', 'business')),
  status     text        not null default 'active'
               check (status in ('active', 'inactive', 'trial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id)
);

create index if not exists venue_subscriptions_venue_id_idx
  on public.venue_subscriptions (venue_id);

drop trigger if exists venue_subscriptions_set_updated_at on public.venue_subscriptions;
create trigger venue_subscriptions_set_updated_at
  before update on public.venue_subscriptions
  for each row execute function public.set_updated_at();

-- ── user_plans ───────────────────────────────────────────────────────────────

create table if not exists public.user_plans (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  plan       text        not null default 'free'
               check (plan   in ('free', 'power')),
  status     text        not null default 'active'
               check (status in ('active', 'inactive', 'trial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists user_plans_user_id_idx
  on public.user_plans (user_id);

drop trigger if exists user_plans_set_updated_at on public.user_plans;
create trigger user_plans_set_updated_at
  before update on public.user_plans
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Service role (admin console) bypasses RLS by default in Supabase.
-- Authenticated clients get read-only access to their own records.
-- All writes go through the admin console (service role); no self-service writes.

alter table public.venue_subscriptions enable row level security;
alter table public.user_plans          enable row level security;

drop policy if exists "venue_subscriptions_select_org_member"
  on public.venue_subscriptions;
create policy "venue_subscriptions_select_org_member"
  on public.venue_subscriptions for select
  using (
    exists (
      select 1
      from   public.venues v
      join   public.org_members om on om.org_id = v.org_id
      where  v.id = venue_id
        and  om.user_id = auth.uid()
    )
  );

drop policy if exists "user_plans_select_owner" on public.user_plans;
create policy "user_plans_select_owner"
  on public.user_plans for select
  using (user_id = auth.uid());

grant select on public.venue_subscriptions to authenticated;
grant select on public.user_plans          to authenticated;
