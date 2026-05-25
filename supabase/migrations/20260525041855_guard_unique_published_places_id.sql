-- Backstop guardrail: prevent two PUBLISHED venues from sharing the same Google places_id
-- (root cause of the O'Dowd's duplicate that slipped through the staging->venues promotion).
CREATE UNIQUE INDEX IF NOT EXISTS venues_unique_published_places_id
ON public.venues (places_id)
WHERE status = 'published' AND places_id IS NOT NULL;
