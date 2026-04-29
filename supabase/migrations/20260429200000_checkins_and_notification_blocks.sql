-- venue_visits: track how a visit was recorded and whether the user wants it private
ALTER TABLE venue_visits
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- Per-venue notification opt-out (user blocks happy-hour pings from a specific venue)
CREATE TABLE IF NOT EXISTS user_venue_notification_blocks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id    UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

ALTER TABLE user_venue_notification_blocks ENABLE ROW LEVEL SECURITY;

-- Users manage only their own blocks; venues can count blocks against themselves via service role
CREATE POLICY "users_manage_own_notification_blocks"
  ON user_venue_notification_blocks
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notification_blocks_user_id
  ON user_venue_notification_blocks (user_id);

CREATE INDEX IF NOT EXISTS idx_notification_blocks_venue_id
  ON user_venue_notification_blocks (venue_id);
