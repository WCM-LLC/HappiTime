-- Backfill existing venue visits into the user activity stream. Future rows are
-- handled by venue_visits_sync_user_event.

INSERT INTO public.user_events (user_id, event_type, venue_id, meta, created_at)
SELECT
  vv.user_id,
  CASE
    WHEN vv.source = 'auto_proximity' THEN 'auto_checkin'
    ELSE 'venue_checkin'
  END AS event_type,
  vv.venue_id,
  jsonb_build_object(
    'visit_id', vv.id,
    'source', vv.source,
    'is_private', vv.is_private,
    'venue_name', COALESCE(v.org_name, v.name),
    'venue_published', COALESCE(v.status = 'published', false)
  ) AS meta,
  vv.entered_at
FROM public.venue_visits vv
LEFT JOIN public.venues v ON v.id = vv.venue_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_events ue
  WHERE ue.event_type IN ('auto_checkin', 'venue_checkin')
    AND ue.meta->>'visit_id' = vv.id::text
);
