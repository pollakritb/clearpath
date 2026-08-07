-- LINE Messaging API account linking. Access is service-role only through /api/*.
CREATE TABLE IF NOT EXISTS line_notification_links (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  line_user_id TEXT UNIQUE,
  link_code_hash TEXT UNIQUE,
  link_code_expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS line_notification_links_active_idx
  ON line_notification_links (user_id) WHERE active = TRUE;

ALTER TABLE line_notification_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE line_notification_links IS
  'Server-only mapping between ClearPath profiles and LINE Messaging API user IDs.';
