# Database Schema (Supabase Postgres)

Canonical schema lives in `supabase/migrations/` and is designed for:
- Multi-tenant orgs + venue assignments (portal)
- Public read-only discovery for published listings (mobile)

## Core Tables
- `organizations`: tenant root (org groups)
- `org_members`: org membership + role (`owner|manager|host|admin|editor|viewer`)
- `venues`: venues/locations (status `draft|published|archived`)
- `venue_members`: per-venue assignments (used for manager/host access)
- `org_invites`: email invites + scoped venue assignments

- `happy_hour_windows`: schedule windows (`draft|published`)
- `happy_hour_offers`: offer rows tied to venue + optionally a window

- `menus`: menu container (`draft|published`) + `is_active`; supports venue menus and organization templates (`scope`)
- `menu_sections`: sections under a menu
- `menu_items`: items under a section (supports `is_happy_hour`)
- `happy_hour_window_menus`: join table to attach menus to windows

- `venue_media`: metadata for files stored in Storage bucket `venue-media`

- `events`: analytics/events ingest table (server-write; portal reads counts)
- `venue_event_counts`: view for simple per-venue event summaries

- `happy_hour_places`: optional public dataset used by the consumer app search/browse UI

- `listing_reports`: consumer "Something's off" reports (`hours_wrong|menu_or_price_wrong|deal_not_honored`; status `open|confirmed|rejected`). Users insert directly under RLS (one open report per user/venue/type); resolution is service-role only. 2+ distinct open reporters within 14 days auto-sets `venues.listing_disputed`; any happy-hour window/offer edit or venue re-confirm stamps `last_confirmed_at` and clears the dispute. See `20260611230000_listing_verification_loop.sql`.

## Relationships (high level)
- `organizations (1) -> (N) venues`
- `organizations (1) -> (N) org_members`
- `venues (1) -> (N) happy_hour_windows`
- `venues (1) -> (N) happy_hour_offers`
- `organizations (1) -> (N) organization menu templates`
- `venues (1) -> (N) venue menus -> menu_sections -> menu_items`
- `organization menu templates (1) -> (N) venue menu copies` via `menus.source_menu_id`
- `happy_hour_windows (N) <-> (N) menus` via `happy_hour_window_menus`

## Indexes
Hot paths are indexed (org/venue/status, and event lookups):
- `venues(org_id)`, `venues(status)`
- `happy_hour_windows(venue_id)`, `happy_hour_windows(status)`
- `menus(org_id)`, `menus(venue_id)`, `menus(scope)`, `menus(status)`, `menus(is_active)`
- `events(org_id, venue_id, event_type)`, `events(occurred_at)`
