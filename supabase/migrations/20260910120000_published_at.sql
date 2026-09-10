-- When did this content go live?
--
-- Nothing recorded it. venues has published_at and guides have it; the three
-- content tables did not. The contributor leaderboard scores published content
-- on a 90-day window, and without this the only available clock is created_at
-- — which silently scores zero for anything published more than 90 days after
-- it was scanned. A super user cannot publish their own work, so that delay is
-- never theirs to control.
--
-- No backfill. Existing published rows keep NULL: they are also unattributed,
-- so they could never score anyway, and inventing a publish date would be a
-- guess dressed as data.

alter table public.menus
  add column if not exists published_at timestamptz;
alter table public.happy_hour_windows
  add column if not exists published_at timestamptz;
alter table public.venue_events
  add column if not exists published_at timestamptz;

-- Partial: the scoring view only ever reads rows that have been published.
create index if not exists menus_published_at_idx
  on public.menus (published_at) where published_at is not null;
create index if not exists happy_hour_windows_published_at_idx
  on public.happy_hour_windows (published_at) where published_at is not null;
create index if not exists venue_events_published_at_idx
  on public.venue_events (published_at) where published_at is not null;
