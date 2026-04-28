-- Migration: Add venue events, cuisine types, and approved searchable tags
-- 2026-04-23T13:00:00

-- ─── 1. Approved Tags Pool ─────────────────────────────────────────────────
-- Categories: cuisine, vibe, feature, dietary, drink_type
create table if not exists public.approved_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category text not null check (category in ('cuisine', 'vibe', 'feature', 'dietary', 'drink_type')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists approved_tags_category_idx on public.approved_tags (category);
create index if not exists approved_tags_active_idx on public.approved_tags (is_active) where is_active = true;

-- Seed default cuisine tags
insert into public.approved_tags (slug, label, category, sort_order) values
  ('american', 'American', 'cuisine', 1),
  ('mexican', 'Mexican', 'cuisine', 2),
  ('italian', 'Italian', 'cuisine', 3),
  ('asian', 'Asian', 'cuisine', 4),
  ('japanese', 'Japanese', 'cuisine', 5),
  ('chinese', 'Chinese', 'cuisine', 6),
  ('thai', 'Thai', 'cuisine', 7),
  ('indian', 'Indian', 'cuisine', 8),
  ('mediterranean', 'Mediterranean', 'cuisine', 9),
  ('bbq', 'BBQ', 'cuisine', 10),
  ('seafood', 'Seafood', 'cuisine', 11),
  ('steakhouse', 'Steakhouse', 'cuisine', 12),
  ('pizza', 'Pizza', 'cuisine', 13),
  ('sushi', 'Sushi', 'cuisine', 14),
  ('korean', 'Korean', 'cuisine', 15),
  ('cajun', 'Cajun', 'cuisine', 16),
  ('soul-food', 'Soul Food', 'cuisine', 17),
  ('southern', 'Southern', 'cuisine', 18),
  ('burger', 'Burgers', 'cuisine', 19),
  ('gastropub', 'Gastropub', 'cuisine', 20),
  ('brunch', 'Brunch', 'cuisine', 21),
  ('tapas', 'Tapas', 'cuisine', 22)
on conflict (slug) do nothing;

-- Seed vibe tags
insert into public.approved_tags (slug, label, category, sort_order) values
  ('rooftop', 'Rooftop', 'vibe', 1),
  ('patio', 'Patio', 'vibe', 2),
  ('sports-bar', 'Sports Bar', 'vibe', 3),
  ('dive-bar', 'Dive Bar', 'vibe', 4),
  ('cocktail-bar', 'Cocktail Bar', 'vibe', 5),
  ('wine-bar', 'Wine Bar', 'vibe', 6),
  ('brewery', 'Brewery', 'vibe', 7),
  ('lounge', 'Lounge', 'vibe', 8),
  ('live-music', 'Live Music', 'vibe', 9),
  ('family-friendly', 'Family Friendly', 'vibe', 10),
  ('late-night', 'Late Night', 'vibe', 11),
  ('upscale', 'Upscale', 'vibe', 12),
  ('casual', 'Casual', 'vibe', 13),
  ('date-night', 'Date Night', 'vibe', 14)
on conflict (slug) do nothing;

-- Seed feature tags
insert into public.approved_tags (slug, label, category, sort_order) values
  ('dog-friendly', 'Dog Friendly', 'feature', 1),
  ('free-wifi', 'Free WiFi', 'feature', 2),
  ('trivia-night', 'Trivia Night', 'feature', 3),
  ('karaoke', 'Karaoke', 'feature', 4),
  ('pool-table', 'Pool Table', 'feature', 5),
  ('darts', 'Darts', 'feature', 6),
  ('outdoor-seating', 'Outdoor Seating', 'feature', 7),
  ('private-events', 'Private Events', 'feature', 8),
  ('reservations', 'Reservations', 'feature', 9)
on conflict (slug) do nothing;

-- Seed drink type tags
insert into public.approved_tags (slug, label, category, sort_order) values
  ('craft-beer', 'Craft Beer', 'drink_type', 1),
  ('cocktails', 'Cocktails', 'drink_type', 2),
  ('wine', 'Wine', 'drink_type', 3),
  ('margaritas', 'Margaritas', 'drink_type', 4),
  ('whiskey', 'Whiskey', 'drink_type', 5),
  ('sake', 'Sake', 'drink_type', 6)
on conflict (slug) do nothing;

-- ─── 2. Venue-Tag Join Table ───────────────────────────────────────────────
-- Replaces the text[] tags column with a proper many-to-many relationship
create table if not exists public.venue_tags (
  venue_id uuid not null references public.venues(id) on delete cascade,
  tag_id uuid not null references public.approved_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_id, tag_id)
);

create index if not exists venue_tags_tag_idx on public.venue_tags (tag_id);

-- ─── 3. Cuisine Type on Venues ─────────────────────────────────────────────
alter table public.venues
  add column if not exists cuisine_type text default null;

-- ─── 4. Venue Events ──────────────────────────────────────────────────────
create table if not exists public.venue_events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'event'
    check (event_type in ('event', 'special', 'live_music', 'trivia', 'sports', 'other')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived', 'canceled')),

  -- Scheduling
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_recurring boolean not null default false,
  recurrence_rule text, -- e.g., 'FREQ=WEEKLY;BYDAY=TH'
  timezone text not null default 'America/Chicago',

  -- Location override (null = same as venue)
  location_override text,

  -- Media
  cover_image_path text, -- storage path in venue-media bucket

  -- Metadata
  external_url text,
  ticket_url text,
  price_info text, -- e.g., "$5 cover", "Free", "$10-$25"
  capacity int,
  tags text[] not null default '{}',

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venue_events_venue_id_idx on public.venue_events (venue_id);
create index if not exists venue_events_status_idx on public.venue_events (status);
create index if not exists venue_events_starts_at_idx on public.venue_events (starts_at);
create index if not exists venue_events_type_idx on public.venue_events (event_type);

-- ─── 5. Event-Media Join ──────────────────────────────────────────────────
-- Allow attaching multiple media items to an event
create table if not exists public.event_media (
  event_id uuid not null references public.venue_events(id) on delete cascade,
  media_id uuid not null references public.venue_media(id) on delete cascade,
  sort_order int not null default 0,
  primary key (event_id, media_id)
);

-- ─── 6. Upcoming Events Convenience View ──────────────────────────────────
create or replace view public.upcoming_events as
select
  ve.*,
  v.name as venue_name,
  v.slug as venue_slug,
  v.address as venue_address,
  v.neighborhood as venue_neighborhood,
  v.city as venue_city,
  v.lat as venue_lat,
  v.lng as venue_lng
from public.venue_events ve
join public.venues v on ve.venue_id = v.id
where ve.status = 'published'
  and (ve.ends_at is null or ve.ends_at > now())
  and ve.starts_at > now() - interval '1 day'
order by ve.starts_at asc;

-- ─── 7. Updated_at triggers ───────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists venue_events_updated_at on public.venue_events;
create trigger venue_events_updated_at
  before update on public.venue_events
  for each row execute function public.set_updated_at();

-- ─── 8. RLS Policies ─────────────────────────────────────────────────────
alter table public.venue_events enable row level security;
alter table public.event_media enable row level security;
alter table public.approved_tags enable row level security;
alter table public.venue_tags enable row level security;

-- Public read access for published events and tags
drop policy if exists "Public can view published events" on public.venue_events;
create policy "Public can view published events"
  on public.venue_events for select
  using (status = 'published');

drop policy if exists "Org members can manage events" on public.venue_events;
create policy "Org members can manage events"
  on public.venue_events for all
  using (
    exists (
      select 1 from public.venues v
      join public.org_members om on om.org_id = v.org_id
      where v.id = venue_events.venue_id
        and om.user_id = auth.uid()
    )
  );

drop policy if exists "Public can view event media" on public.event_media;
create policy "Public can view event media"
  on public.event_media for select
  using (true);

drop policy if exists "Public can view approved tags" on public.approved_tags;
create policy "Public can view approved tags"
  on public.approved_tags for select
  using (is_active = true);

drop policy if exists "Public can view venue tags" on public.venue_tags;
create policy "Public can view venue tags"
  on public.venue_tags for select
  using (true);

drop policy if exists "Org members can manage venue tags" on public.venue_tags;
create policy "Org members can manage venue tags"
  on public.venue_tags for all
  using (
    exists (
      select 1 from public.venues v
      join public.org_members om on om.org_id = v.org_id
      where v.id = venue_tags.venue_id
        and om.user_id = auth.uid()
    )
  );
