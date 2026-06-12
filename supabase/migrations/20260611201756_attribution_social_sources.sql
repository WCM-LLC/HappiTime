-- Reconstructed from remote supabase_migrations.schema_migrations (Jun 11 2026).
-- This version was applied directly to the remote project without a local file,
-- which broke `supabase db push` (remote version missing locally). Content is
-- verbatim from the remote history — do not edit.

alter table public.venue_attribution_events
  drop constraint if exists venue_attribution_events_source_check;

alter table public.venue_attribution_events
  add constraint venue_attribution_events_source_check
  check (source in (
    'qr', 'app_checkin', 'push_click', 'organic',
    'tiktok', 'instagram', 'facebook', 'social'
  ));
