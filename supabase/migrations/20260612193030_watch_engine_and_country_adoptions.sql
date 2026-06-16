-- WATCH OCCASION ENGINE (World Cup 2026 now, Chiefs season later)
-- Applied to prod 2026-06-12 via MCP (mirror copy for repo history).

-- 1) Source of truth: per-venue, per-event watch status
create table public.venue_watch_status (
  venue_id uuid not null references public.venues(id) on delete cascade,
  event_key text not null default 'world_cup_2026',
  shows_games boolean not null,
  sound_on boolean,
  big_screen boolean,
  reservations text check (reservations in ('walk_in','recommended','required')),
  notes text,
  verified_at timestamptz,
  verified_by text,
  source text not null default 'ambassador',
  updated_at timestamptz not null default now(),
  primary key (venue_id, event_key)
);

alter table public.venue_watch_status enable row level security;

create policy watch_status_select_public on public.venue_watch_status
  for select to public using (true);
-- writes: service role only (no anon/authenticated write policies)

create index idx_watch_status_event on public.venue_watch_status (event_key) where shows_games;

-- 2) Ambassador submissions queue (bounty intake, mirrors tag_suggestions review pattern)
create table public.watch_verifications (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  event_key text not null default 'world_cup_2026',
  shows_games boolean not null,
  sound_on boolean,
  big_screen boolean,
  reservations text check (reservations in ('walk_in','recommended','required')),
  notes text check (char_length(notes) <= 500),
  submitted_by text not null check (char_length(submitted_by) between 2 and 80),
  contact text check (char_length(contact) <= 120),
  photo_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.watch_verifications enable row level security;

create policy watch_verifications_insert_anon on public.watch_verifications
  for insert to anon, authenticated with check (status = 'pending');
-- no select policy for anon: submissions (incl. contact info) are not publicly readable

create index idx_watch_verifications_pending on public.watch_verifications (created_at) where status = 'pending';

-- 3) Approval helper: promote a verification into venue_watch_status
create or replace function public.approve_watch_verification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v record;
begin
  select * into v from watch_verifications where id = p_id and status = 'pending';
  if not found then
    raise exception 'verification % not found or not pending', p_id;
  end if;

  insert into venue_watch_status as ws
    (venue_id, event_key, shows_games, sound_on, big_screen, reservations, notes, verified_at, verified_by, source, updated_at)
  values
    (v.venue_id, v.event_key, v.shows_games, v.sound_on, v.big_screen, v.reservations, v.notes, now(), v.submitted_by, 'ambassador', now())
  on conflict (venue_id, event_key) do update set
    shows_games = excluded.shows_games,
    sound_on = excluded.sound_on,
    big_screen = excluded.big_screen,
    reservations = excluded.reservations,
    notes = excluded.notes,
    verified_at = excluded.verified_at,
    verified_by = excluded.verified_by,
    updated_at = now();

  update watch_verifications set status = 'approved', reviewed_at = now() where id = p_id;
end;
$$;

revoke execute on function public.approve_watch_verification(uuid) from public, anon, authenticated;

-- COUNTRY ADOPTION (World Cup home bars)
create table public.venue_country_adoptions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  country_code text not null check (char_length(country_code) = 2),
  country_name text not null,
  starts_on date not null default '2026-06-11',
  ends_on date not null default '2026-07-19',
  status text not null default 'pending' check (status in ('pending','active','ended')),
  notes text,
  created_at timestamptz not null default now(),
  unique (venue_id, country_code)
);

alter table public.venue_country_adoptions enable row level security;

create policy country_adoptions_select_public on public.venue_country_adoptions
  for select to public using (status = 'active');
-- writes: service role only
