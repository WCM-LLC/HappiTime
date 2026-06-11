-- Extend venue_attribution_events sources with social campaign channels
-- (tiktok / instagram / facebook / social). These are recorded when a venue
-- page on the directory is opened with utm_source=<channel> (or src=) — the
-- TikTok "Tonight in KC" series and future social campaigns. Writes still flow
-- only through the service-role track-visit edge function (VALID_SOURCES
-- updated in the same change); this constraint is the DB-side mirror.
--
-- Applied to remote via Supabase MCP apply_migration (name: attribution_social_sources).

alter table public.venue_attribution_events
  drop constraint if exists venue_attribution_events_source_check;

alter table public.venue_attribution_events
  add constraint venue_attribution_events_source_check
  check (source in (
    'qr', 'app_checkin', 'push_click', 'organic',
    'tiktok', 'instagram', 'facebook', 'social'
  ));

-- ── DOWN (manual rollback) ───────────────────────────────────────────────────
-- alter table public.venue_attribution_events
--   drop constraint if exists venue_attribution_events_source_check;
-- alter table public.venue_attribution_events
--   add constraint venue_attribution_events_source_check
--   check (source in ('qr','app_checkin','push_click','organic'));
