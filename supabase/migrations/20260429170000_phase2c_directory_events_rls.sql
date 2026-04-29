BEGIN;

-- C) Tighten directory_events INSERT policy — was WITH CHECK (true).
--    Replaces the always-true check with:
--      - event_type present and bounded (1-64 chars, no pathological payloads)
--      - meta JSON payload bounded to 4 KB
--    Also adds matching CHECK constraints on the table so the DB rejects bad rows
--    regardless of how they arrive (bypassed RLS, service_role inserts, etc.).

-- Replace the overly-permissive INSERT policy
DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.directory_events;

CREATE POLICY "Allow anonymous inserts" ON public.directory_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    event_type IS NOT NULL
    AND length(event_type) BETWEEN 1 AND 64
    AND (meta IS NULL OR octet_length(meta::text) <= 4096)
  );

-- Belt-and-suspenders: table-level constraints (survive even service_role inserts)
ALTER TABLE public.directory_events
  ADD CONSTRAINT directory_events_event_type_length
    CHECK (length(event_type) BETWEEN 1 AND 64);

ALTER TABLE public.directory_events
  ADD CONSTRAINT directory_events_meta_size
    CHECK (meta IS NULL OR octet_length(meta::text) <= 4096);

COMMIT;
