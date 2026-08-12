-- Self-serve vision intake (Integration Fixes spec, Fix 4 + super-user
-- addendum): org owners/managers and super users can scan menus; their
-- commits always land as drafts plus a review-queue entry that an admin
-- approves or rejects. Admin intake behavior is unchanged.

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  menu_id uuid references public.menus(id) on delete set null,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  -- which gate admitted the submitter; the review queue shows it
  tier text not null check (tier in ('owner', 'super_user')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- FK indexes up front (the performance advisor flags unindexed FKs).
create index if not exists intake_submissions_venue_id_idx on public.intake_submissions (venue_id);
create index if not exists intake_submissions_submitted_by_idx on public.intake_submissions (submitted_by);
create index if not exists intake_submissions_menu_id_idx on public.intake_submissions (menu_id);
create index if not exists intake_submissions_status_idx on public.intake_submissions (status) where status = 'pending';

alter table public.intake_submissions enable row level security;

-- Submitters see their own rows (status updates surface in their UI);
-- all writes go through service-role API routes.
create policy intake_submissions_select_own on public.intake_submissions
  for select to authenticated
  using (submitted_by = (select auth.uid()));

-- Daily extract-cap ledger: one row per extract call, counted per service day.
create table if not exists public.intake_extract_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  provider text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists intake_extract_log_user_day_idx on public.intake_extract_log (user_id, created_at);
create index if not exists intake_extract_log_venue_id_idx on public.intake_extract_log (venue_id);

alter table public.intake_extract_log enable row level security;
-- No client policies: the extract API route writes via service role only.
