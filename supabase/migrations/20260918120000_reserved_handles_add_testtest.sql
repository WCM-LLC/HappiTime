-- Add additional reserved handles.
-- Mirrors RESERVED_HANDLES in packages/shared-types/reserved-handles.ts.
-- 'test' was already seeded by 20260518140000_populate_reserved_handles.sql;
-- it is re-listed here only for safety (ON CONFLICT DO NOTHING makes it a no-op).

INSERT INTO public.reserved_handles (handle) VALUES
  ('test'), ('testtest')
ON CONFLICT (handle) DO NOTHING;
