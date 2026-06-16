-- Resolution state for the address-review queue. Set when an admin dismisses a
-- flag (keeps our address); makes the cron stop re-flagging that venue.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS address_review_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS address_review_resolved_by uuid REFERENCES auth.users(id);

-- Read model for /admin/address-review: flagged venues + their latest
-- validation-log row. security_invoker per repo convention
-- (20260429150000_phase2a_security_invoker_views); the admin page queries it
-- with the service-role client.
CREATE OR REPLACE VIEW public.v_address_review_queue
WITH (security_invoker = true) AS
SELECT
  v.id        AS venue_id,
  v.org_id    AS org_id,
  v.name      AS venue_name,
  v.slug      AS venue_slug,
  v.address, v.city, v.state, v.zip,
  v.places_id,
  v.places_validated_at,
  log.stored_address,
  log.google_address,
  log.match_score,
  log.checked_at
FROM public.venues v
JOIN LATERAL (
  SELECT l.stored_address, l.google_address, l.match_score, l.checked_at
  FROM public.venue_validation_log l
  WHERE l.venue_id = v.id
  ORDER BY l.checked_at DESC
  LIMIT 1
) log ON true
WHERE v.needs_address_review = true
ORDER BY log.match_score ASC NULLS FIRST, log.checked_at DESC;
