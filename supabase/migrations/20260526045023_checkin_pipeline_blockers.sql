-- Make venue_visits the venue-centric source of truth while keeping user_events
-- as the user-facing activity timeline.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

-- Rename the user-facing visibility value from "friends" to "public" while
-- accepting legacy rows/clients during rollout.
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_default_checkin_privacy_check;

UPDATE public.user_preferences
SET default_checkin_privacy = 'public'
WHERE default_checkin_privacy = 'friends';

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_default_checkin_privacy_check
  CHECK (default_checkin_privacy IN ('private', 'public', 'friends'));

CREATE UNIQUE INDEX IF NOT EXISTS user_events_visit_id_unique_idx
  ON public.user_events ((meta->>'visit_id'))
  WHERE event_type IN ('auto_checkin', 'venue_checkin')
    AND meta ? 'visit_id';

CREATE INDEX IF NOT EXISTS venue_visits_dedupe_window_idx
  ON public.venue_visits (user_id, venue_id, source, entered_at DESC);

CREATE OR REPLACE FUNCTION app_private.prevent_duplicate_venue_visit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app_private
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.venue_visits vv
    WHERE vv.user_id = NEW.user_id
      AND vv.venue_id = NEW.venue_id
      AND vv.source = NEW.source
      AND vv.id <> NEW.id
      AND abs(extract(epoch FROM (vv.entered_at - NEW.entered_at))) < 7200
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'duplicate venue visit within two-hour window'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venue_visits_prevent_duplicate_window ON public.venue_visits;
CREATE TRIGGER venue_visits_prevent_duplicate_window
  BEFORE INSERT OR UPDATE OF user_id, venue_id, source, entered_at
  ON public.venue_visits
  FOR EACH ROW
  EXECUTE FUNCTION app_private.prevent_duplicate_venue_visit();

CREATE OR REPLACE FUNCTION public.record_venue_visit(
  p_venue_id uuid,
  p_source text,
  p_entered_at timestamptz DEFAULT now(),
  p_is_private boolean DEFAULT true,
  p_rating integer DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_exited_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entered_at timestamptz := COALESCE(p_entered_at, now());
  v_source text := COALESCE(NULLIF(btrim(p_source), ''), 'manual');
  v_existing_id uuid;
  v_inserted_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_venue_id IS NULL THEN
    RAISE EXCEPTION 'venue id is required' USING ERRCODE = '23502';
  END IF;

  SELECT vv.id
  INTO v_existing_id
  FROM public.venue_visits vv
  WHERE vv.user_id = v_user_id
    AND vv.venue_id = p_venue_id
    AND vv.source = v_source
    AND abs(extract(epoch FROM (vv.entered_at - v_entered_at))) < 7200
  ORDER BY abs(extract(epoch FROM (vv.entered_at - v_entered_at))) ASC,
           vv.entered_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.venue_visits vv
    SET rating = COALESCE(p_rating, vv.rating),
        comment = COALESCE(NULLIF(btrim(p_comment), ''), vv.comment),
        duration_minutes = COALESCE(p_duration_minutes, vv.duration_minutes),
        exited_at = COALESCE(p_exited_at, vv.exited_at)
    WHERE vv.id = v_existing_id
      AND vv.user_id = v_user_id;

    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  INSERT INTO public.venue_visits (
    user_id,
    venue_id,
    entered_at,
    source,
    is_private,
    rating,
    comment,
    duration_minutes,
    exited_at
  )
  VALUES (
    v_user_id,
    p_venue_id,
    v_entered_at,
    v_source,
    COALESCE(p_is_private, true),
    p_rating,
    NULLIF(btrim(p_comment), ''),
    p_duration_minutes,
    p_exited_at
  )
  RETURNING venue_visits.id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_venue_visit(
  uuid, text, timestamptz, boolean, integer, text, integer, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_venue_visit(
  uuid, text, timestamptz, boolean, integer, text, integer, timestamptz
) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.sync_venue_visit_user_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_event_type text;
  v_venue_name text;
  v_venue_published boolean := false;
  v_meta jsonb;
BEGIN
  v_event_type := CASE
    WHEN NEW.source = 'auto_proximity' THEN 'auto_checkin'
    ELSE 'venue_checkin'
  END;

  SELECT COALESCE(v.org_name, v.name), v.status = 'published'
  INTO v_venue_name, v_venue_published
  FROM public.venues v
  WHERE v.id = NEW.venue_id;

  v_meta := jsonb_build_object(
    'visit_id', NEW.id,
    'source', NEW.source,
    'is_private', NEW.is_private,
    'venue_name', v_venue_name,
    'venue_published', COALESCE(v_venue_published, false)
  );

  UPDATE public.user_events ue
  SET event_type = v_event_type,
      user_id = NEW.user_id,
      venue_id = NEW.venue_id,
      created_at = NEW.entered_at,
      meta = COALESCE(ue.meta, '{}'::jsonb) || v_meta
  WHERE ue.event_type IN ('auto_checkin', 'venue_checkin')
    AND ue.meta->>'visit_id' = NEW.id::text;

  IF NOT FOUND THEN
    INSERT INTO public.user_events (user_id, event_type, venue_id, meta, created_at)
    VALUES (NEW.user_id, v_event_type, NEW.venue_id, v_meta, NEW.entered_at);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.sync_venue_visit_user_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS venue_visits_sync_user_event ON public.venue_visits;
CREATE TRIGGER venue_visits_sync_user_event
  AFTER INSERT OR UPDATE OF user_id, venue_id, entered_at, source, is_private
  ON public.venue_visits
  FOR EACH ROW
  EXECUTE FUNCTION app_private.sync_venue_visit_user_event();

DROP POLICY IF EXISTS "user_events_select_owner" ON public.user_events;
DROP POLICY IF EXISTS "user_events_select_owner_or_public_activity" ON public.user_events;
CREATE POLICY "user_events_select_owner_or_public_activity"
  ON public.user_events
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      event_type IN ('auto_checkin', 'venue_checkin', 'itinerary_share', 'rating', 'comment', 'follow')
      AND COALESCE(meta->>'is_private', 'false') = 'false'
      AND (
        venue_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.venues v
          WHERE v.id = public.user_events.venue_id
            AND v.status = 'published'
        )
      )
    )
  );

DROP POLICY IF EXISTS "user_events_insert_owner" ON public.user_events;
CREATE POLICY "user_events_insert_owner"
  ON public.user_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE public.user_events FROM anon;
GRANT SELECT, INSERT ON TABLE public.user_events TO authenticated;

CREATE OR REPLACE FUNCTION public.get_venue_visit_stats(
  p_venue_id uuid,
  p_since timestamptz DEFAULT now() - interval '24 hours'
)
RETURNS TABLE(
  venue_id uuid,
  total_count bigint,
  recent_count bigint,
  private_count bigint,
  active_count bigint,
  average_duration_minutes numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_allowed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.venues v
    JOIN public.org_members om
      ON om.org_id = v.org_id
     AND om.user_id = v_user_id
     AND om.role IN ('owner', 'manager')
    WHERE v.id = p_venue_id
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'not authorized for venue visit stats' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p_venue_id AS venue_id,
    count(*) AS total_count,
    count(*) FILTER (WHERE vv.entered_at >= p_since) AS recent_count,
    count(*) FILTER (WHERE vv.is_private) AS private_count,
    count(*) FILTER (WHERE vv.exited_at IS NULL) AS active_count,
    avg(vv.duration_minutes) FILTER (WHERE vv.duration_minutes IS NOT NULL) AS average_duration_minutes
  FROM public.venue_visits vv
  WHERE vv.venue_id = p_venue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_venue_visit_stats(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_venue_visit_stats(uuid, timestamptz) TO authenticated;
