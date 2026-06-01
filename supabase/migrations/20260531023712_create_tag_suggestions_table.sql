-- Reconciled into the repo from the remote ledger (version 20260531023712): this
-- migration was applied to prod (ujflcrjsiyhofnomurco) but missing from the repo.
-- SQL below is the exact statement recorded in supabase_migrations.schema_migrations.

CREATE TABLE IF NOT EXISTS tag_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES approved_tags(id) ON DELETE CASCADE,
  source text NOT NULL,
  confidence numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence text,
  applied_at timestamptz,
  rejected_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, tag_id, source)
);

CREATE INDEX IF NOT EXISTS idx_tag_suggestions_venue ON tag_suggestions(venue_id);
CREATE INDEX IF NOT EXISTS idx_tag_suggestions_pending ON tag_suggestions(venue_id) WHERE applied_at IS NULL AND rejected_at IS NULL;

ALTER TABLE tag_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tag_suggestions_admin_all ON tag_suggestions
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
