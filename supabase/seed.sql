-- Seed data for local development (loaded by `supabase db reset`).
-- This file is intentionally small and deterministic.

insert into public.organizations (id, name, slug, created_by)
values ('11111111-1111-1111-1111-111111111111', 'HappiTime Demo', 'happitime-demo', null)
on conflict (id) do nothing;

insert into public.venues (
  id,
  org_id,
  name,
  slug,
  org_name,
  app_name_preference,
  address,
  neighborhood,
  city,
  state,
  zip,
  timezone,
  lat,
  lng,
  phone,
  website,
  tags,
  status,
  published_at
)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Demo Taproom',
  'demo-taproom',
  'HappiTime Demo',
  'org',
  '123 Main St',
  'Downtown',
  'Chicago',
  'IL',
  '60601',
  'America/Chicago',
  41.8837,
  -87.6325,
  '555-555-5555',
  'https://example.com',
  array['demo','cocktails']::text[],
  'published',
  now()
)
on conflict (id) do nothing;

insert into public.happy_hour_windows (
  id,
  venue_id,
  dow,
  start_time,
  end_time,
  timezone,
  status,
  label
)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  array[1,2,3,4,5]::int[],
  '16:00',
  '18:00',
  'America/Chicago',
  'published',
  'Weekday Happy Hour'
)
on conflict (id) do nothing;

insert into public.happy_hour_offers (
  id,
  venue_id,
  window_id,
  category,
  title,
  description,
  status
)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'drinks',
  'Half-price drafts',
  'All house drafts are 50% off during happy hour.',
  'published'
)
on conflict (id) do nothing;

insert into public.menus (id, venue_id, name, status, is_active)
values (
  '55555555-5555-5555-5555-555555555555',
  '22222222-2222-2222-2222-222222222222',
  'Happy Hour',
  'published',
  true
)
on conflict (id) do nothing;

insert into public.happy_hour_window_menus (happy_hour_window_id, menu_id)
values (
  '33333333-3333-3333-3333-333333333333',
  '55555555-5555-5555-5555-555555555555'
)
on conflict do nothing;

insert into public.menu_sections (id, menu_id, name, sort_order)
values (
  '66666666-6666-6666-6666-666666666666',
  '55555555-5555-5555-5555-555555555555',
  'Drinks',
  1
)
on conflict (id) do nothing;

insert into public.menu_items (id, section_id, name, description, price, is_happy_hour, sort_order)
values (
  '77777777-7777-7777-7777-777777777777',
  '66666666-6666-6666-6666-666666666666',
  'House Lager',
  'Crisp and refreshing.',
  4.00,
  true,
  1
)
on conflict (id) do nothing;

-- (removed) seed for public.happy_hour_places — that table was dropped in the BCNF
-- reconciliation (20260601130000_reconcile_drop_dead_bcnf.sql) to match prod, which
-- redesigned the happy-hour domain into happy_hour_windows / happy_hour_offers /
-- happy_hour_window_menus.

