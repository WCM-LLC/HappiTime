-- Closed-venue detection (Integration Fixes spec, Fix 1).
--
-- validate-venue-places now requests businessStatus from Google Places and
-- flags venues Google marks CLOSED_PERMANENTLY (or whose place id 404s).
-- Closure state is kept separate from address-mismatch state so the admin
-- review queue can distinguish the two; closure_review_resolved_at mirrors
-- the address_review_resolved_at human-resolution guard, preventing the
-- cron from re-flagging a dismissed closure.
--
-- The cron only flags. No auto-unpublish, no auto-delete — Google mislabels
-- businesses, so a human confirms every closure in /admin/address-review.

alter table public.venues
  add column if not exists places_business_status text,
  add column if not exists closure_suspected boolean not null default false,
  add column if not exists closure_review_resolved_at timestamptz;

alter table public.venue_validation_log
  add column if not exists business_status text;
