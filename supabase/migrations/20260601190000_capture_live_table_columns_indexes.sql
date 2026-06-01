-- Schema-drift reconciliation, Stage 6a: capture out-of-band columns + indexes + triggers on
-- live tables. Plan: docs/superpowers/plans/2026-06-01-schema-drift-reconciliation.md (prod=target).
--
-- These are non-security-sensitive structural objects added on prod (dashboard) and never
-- committed (performance indexes, the happy-hour verified-venue columns, venue_media legacy
-- columns, and a few BEFORE-triggers). The out-of-band RLS *policies* are captured separately
-- in 6b after a security review. IDEMPOTENT / no-op on prod.

-- ── columns (must precede the indexes that reference them) ───────────────────────
alter table public.happy_hour_windows add column if not exists is_verified boolean not null default false;
alter table public.happy_hour_windows add column if not exists verified_at timestamptz;
alter table public.happy_hour_windows add column if not exists verified_by uuid;
alter table public.venue_media        add column if not exists storage_bucket_legacy text;
alter table public.venue_media        add column if not exists storage_path_legacy   text;
alter table public.venue_media        add column if not exists migrated_at           timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'happy_hour_windows_verified_by_fkey') then
    alter table public.happy_hour_windows
      add constraint happy_hour_windows_verified_by_fkey foreign key (verified_by) references auth.users (id);
  end if;
end $$;

-- ── indexes (verbatim from prod, made idempotent) ────────────────────────────────
create index if not exists hhw_is_verified_idx on public.happy_hour_windows using btree (is_verified) where (is_verified = true);
create index if not exists idx_approved_tags_category on public.approved_tags using btree (category, sort_order) where (is_active = true);
create index if not exists idx_event_media_event on public.event_media using btree (event_id, sort_order);
create index if not exists idx_hhw_venue_status on public.happy_hour_windows using btree (venue_id, status);
create index if not exists idx_menu_sections_menu on public.menu_sections using btree (menu_id);
create index if not exists idx_org_members_user on public.org_members using btree (user_id);
create index if not exists idx_user_followed_venues_user on public.user_followed_venues using btree (user_id);
create index if not exists idx_user_follows_status on public.user_follows using btree (following_user_id, status) where (status = 'pending'::text);
create index if not exists idx_user_push_tokens_user on public.user_push_tokens using btree (user_id);
create index if not exists idx_venue_events_upcoming on public.venue_events using btree (starts_at) where (status = 'published'::text);
create index if not exists idx_venue_events_venue on public.venue_events using btree (venue_id, status, starts_at);
create index if not exists idx_venue_media_unmigrated on public.venue_media using btree (storage_bucket) where (storage_bucket = any (array['venue-media'::text, 'external'::text]));
create index if not exists idx_venue_visits_user on public.venue_visits using btree (user_id, created_at desc);
create index if not exists idx_venue_visits_user_venue on public.venue_visits using btree (user_id, venue_id, entered_at desc);
create index if not exists idx_venue_visits_venue on public.venue_visits using btree (venue_id, created_at desc);
create index if not exists idx_venues_org on public.venues using btree (org_id);
create index if not exists venues_geocode_pending_idx on public.venues using btree (geocode_status, geocode_next_attempt_at, geocode_requested_at);
create index if not exists venues_is_verified_idx on public.venues using btree (is_verified) where (is_verified = true);
create index if not exists venues_org_idx on public.venues using btree (org_id);
create index if not exists venues_places_pending_idx on public.venues using btree (places_status, places_next_sync_at);
create index if not exists venues_tags_gin on public.venues using gin (tags);

-- ── triggers (functions already exist in migrations) ─────────────────────────────
create or replace trigger user_push_tokens_set_updated_at before update on public.user_push_tokens
  for each row execute function public.set_updated_at();
create or replace trigger venues_queue_geocode before insert or update of address, city, state, zip on public.venues
  for each row execute function public.venues_queue_geocode();
create or replace trigger venues_queue_places_sync before insert or update of name, address, city, state, zip on public.venues
  for each row execute function public.venues_queue_places_sync();

-- ── structural reconciliation to match prod exactly ──────────────────────────────
-- prod has organizations_slug_key as a plain UNIQUE INDEX; a historical migration created it
-- as a UNIQUE CONSTRAINT of the same name. Convert to match (no-op on prod: there it is
-- already an index, so DROP CONSTRAINT IF EXISTS is a no-op and CREATE INDEX IF NOT EXISTS is too).
alter table public.organizations drop constraint if exists organizations_slug_key;
create unique index if not exists organizations_slug_key on public.organizations using btree (slug);

-- Drop redundant indexes that migrations create but prod consolidated away (no-op on prod —
-- absent there). slug uniqueness stays enforced by organizations_slug_key; the venue_visits
-- access patterns are now covered by the idx_venue_visits_* indexes above.
drop index if exists public.organizations_slug_unique_not_null;
drop index if exists public.venue_visits_user_entered_idx;
drop index if exists public.venue_visits_venue_entered_idx;
