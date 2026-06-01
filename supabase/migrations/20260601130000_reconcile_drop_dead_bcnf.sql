-- Schema-drift reconciliation, Stage 1 of N (prod = intended target).
-- Plan: docs/superpowers/plans/2026-06-01-schema-drift-reconciliation.md
--
-- The BCNF happy-hour normalization (20260504024213) + the visit-rating columns genuinely
-- RAN on prod, then were dropped OUT-OF-BAND when the happy-hour domain was redesigned into
-- happy_hour_windows / happy_hour_offers / happy_hour_window_menus. No committed migration
-- captured those drops, so a fresh migration replay rebuilds tables/functions/columns that
-- prod no longer has. This migration drops them so a clean replay matches prod.
--
-- VERIFIED NO-OP AGAINST PROD (2026-06-01, catalog check): all 7 tables, 12 functions, and
-- 4 columns below are ABSENT on prod. Every statement is IF EXISTS / CASCADE, so applying to
-- prod changes nothing; it only cleans a fresh replay. (Live-table index/policy reconciliation
-- is handled in a later stage; this stage is the BCNF teardown only.)

-- 1. Dead tables. CASCADE clears their own policies, triggers, FKs, indexes, sequences.
drop table if exists public.happy_hour_menu_item_prices cascade;
drop table if exists public.happy_hour_offer_windows    cascade;
drop table if exists public.happy_hour_places           cascade;
drop table if exists public.happy_hour_window_days      cascade;
drop table if exists public.menu_item_base_prices       cascade;
drop table if exists public.organization_merge_audit    cascade;
drop table if exists public.visit_rating_aspects        cascade;

-- 2. BCNF functions. CASCADE also removes the BCNF sync/validate triggers still attached to
-- LIVE tables (e.g. menu_items_sync_base_price on menu_items, happy_hour_windows_sync_days
-- on happy_hour_windows, happy_hour_offers_sync_window_link on happy_hour_offers,
-- happy_hour_window_menus_sync_prices_* on happy_hour_window_menus).
drop function if exists public.cleanup_window_menu_happy_hour_prices() cascade;
drop function if exists public.normalize_organization_name(text) cascade;
drop function if exists public.organization_slugify(text) cascade;
drop function if exists public.replace_happy_hour_window_menus(uuid, uuid[]) cascade;
drop function if exists public.sync_happy_hour_offer_window_link() cascade;
drop function if exists public.sync_happy_hour_window_days() cascade;
drop function if exists public.sync_menu_item_base_price() cascade;
drop function if exists public.sync_menu_item_happy_hour_prices() cascade;
drop function if exists public.sync_window_menu_happy_hour_prices() cascade;
drop function if exists public.validate_happy_hour_menu_item_price_venue() cascade;
drop function if exists public.validate_happy_hour_offer_window_venue() cascade;
drop function if exists public.validate_happy_hour_window_menu_venue() cascade;

-- 3. The set-updated-at trigger on venue_visits is orphaned once updated_at goes (its body
-- references the column); it is absent on prod. Drop it before the column.
drop trigger if exists venue_visits_set_updated_at on public.venue_visits;

-- 4. Columns the BCNF / visit-rating work added that prod no longer has.
alter table if exists public.venue_visits drop column if exists updated_at;
alter table if exists public.venue_visits drop column if exists visited_at;
alter table if exists public.venues       drop column if exists post_visit_rating_enabled;
alter table if exists public.venues       drop column if exists post_visit_rating_aspects;
