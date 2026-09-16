-- Additive notification preferences and bounded terminal outbox state.
-- Existing preference rows represent an earlier explicit opt-in, while new
-- preference rows must record consent through the application.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS line_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS web_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS quiet_hours_start TEXT DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end TEXT DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  ADD COLUMN IF NOT EXISTS consent_granted BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS consent_granted_at TIMESTAMPTZ;

UPDATE notification_preferences
SET consent_granted_at = COALESCE(consent_granted_at, updated_at, NOW())
WHERE consent_granted = TRUE;

UPDATE notification_preferences
SET quiet_hours_start = COALESCE(quiet_hours_start, '22:00'),
    quiet_hours_end = COALESCE(quiet_hours_end, '07:00')
WHERE quiet_hours_start IS NULL OR quiet_hours_end IS NULL;

ALTER TABLE notification_preferences
  ALTER COLUMN quiet_hours_start SET DEFAULT '22:00',
  ALTER COLUMN quiet_hours_end SET DEFAULT '07:00';

ALTER TABLE notification_preferences
  ALTER COLUMN consent_granted SET DEFAULT FALSE;

ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_quiet_hours_start_check,
  DROP CONSTRAINT IF EXISTS notification_preferences_quiet_hours_end_check,
  DROP CONSTRAINT IF EXISTS notification_preferences_timezone_check;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_quiet_hours_start_check
    CHECK (quiet_hours_start IS NULL OR quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT notification_preferences_quiet_hours_end_check
    CHECK (quiet_hours_end IS NULL OR quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT notification_preferences_timezone_check
    CHECK (timezone = 'Asia/Bangkok');

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_status_check;

ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead'));
