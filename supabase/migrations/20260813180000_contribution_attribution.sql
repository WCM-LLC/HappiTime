-- Contribution attribution: who added this Happy Hour content.
--
-- Nothing recorded this before. On 2026-08-13 production held 136 menus and
-- 219 windows with no author at all, because the only contributor record in
-- the schema (intake_submissions.submitted_by) is written on a branch that
-- requires a submitter who cannot publish — and everyone contributing could.
--
-- created_by_tier snapshots the contributor's tier AT WRITE TIME. Roles
-- change: a super user who later joins an org as an owner must not
-- retroactively vanish from past standings. Deriving the tier at query time
-- would rewrite history every time someone's role changed.
--
-- No backfill. Existing rows stay NULL — nobody is credited for work we
-- cannot prove they did.

alter table public.menus
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by_tier text
    check (created_by_tier in ('admin','owner','super_user','user'));

alter table public.happy_hour_windows
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by_tier text
    check (created_by_tier in ('admin','owner','super_user','user'));

-- venue_events.created_by already exists and is already written by both the
-- console (event-actions.ts) and intake (commit/route.ts). Only the tier is new.
alter table public.venue_events
  add column if not exists created_by_tier text
    check (created_by_tier in ('admin','owner','super_user','user'));

-- Partial indexes for the piece-2 leaderboard aggregation. Attributed rows are
-- a small minority today and will stay a minority of all historical rows, so
-- indexing only non-NULL keeps these cheap.
create index if not exists menus_created_by_idx
  on public.menus (created_by) where created_by is not null;
create index if not exists happy_hour_windows_created_by_idx
  on public.happy_hour_windows (created_by) where created_by is not null;
create index if not exists venue_events_created_by_idx
  on public.venue_events (created_by) where created_by is not null;
