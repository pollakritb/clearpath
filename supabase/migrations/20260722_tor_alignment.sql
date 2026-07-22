-- ClearPath TOR alignment (additive, production-safe)
-- Adds report drafts, privacy-separated evidence, star ratings,
-- in-app notifications/outbox, realtime invalidation, and content lifecycle.

BEGIN;

CREATE TABLE IF NOT EXISTS report_drafts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  capture_session_id UUID NOT NULL UNIQUE REFERENCES capture_sessions(id) ON DELETE CASCADE,
  exact_lat DOUBLE PRECISION NOT NULL CHECK (exact_lat BETWEEN -90 AND 90),
  exact_lon DOUBLE PRECISION NOT NULL CHECK (exact_lon BETWEEN -180 AND 180),
  gps_accuracy_m DOUBLE PRECISION CHECK (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0),
  camera_session_issued_at TIMESTAMPTZ NOT NULL,
  client_captured_at TIMESTAMPTZ NOT NULL,
  effective_captured_at TIMESTAMPTZ NOT NULL,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_warning BOOLEAN NOT NULL DEFAULT FALSE,
  image_path TEXT NOT NULL,
  image_sha256 TEXT NOT NULL,
  image_ahash TEXT,
  burst_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_of_report_id UUID REFERENCES community_reports(id) ON DELETE SET NULL,
  ocr_pm25 DOUBLE PRECISION CHECK (ocr_pm25 BETWEEN 0 AND 1000),
  ocr_confidence DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (ocr_confidence BETWEEN 0 AND 1),
  ocr_raw_text TEXT,
  device_detected BOOLEAN NOT NULL DEFAULT FALSE,
  display_clear BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS report_drafts_user_expiry_idx
  ON report_drafts (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS report_evidence (
  report_id UUID PRIMARY KEY REFERENCES community_reports(id) ON DELETE CASCADE,
  exact_lat DOUBLE PRECISION CHECK (exact_lat BETWEEN -90 AND 90),
  exact_lon DOUBLE PRECISION CHECK (exact_lon BETWEEN -180 AND 180),
  gps_accuracy_m DOUBLE PRECISION CHECK (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0),
  capture_session_id UUID UNIQUE REFERENCES capture_sessions(id) ON DELETE SET NULL,
  camera_session_issued_at TIMESTAMPTZ,
  client_captured_at TIMESTAMPTZ,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_path TEXT,
  image_sha256 TEXT,
  image_ahash TEXT,
  burst_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ocr_raw_text TEXT,
  retention_until TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  audit_hold BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS report_evidence_retention_idx
  ON report_evidence (retention_until) WHERE purged_at IS NULL AND audit_hold = FALSE;

ALTER TABLE community_reports
  ADD COLUMN IF NOT EXISTS user_claimed_pm25 DOUBLE PRECISION CHECK (user_claimed_pm25 BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS admin_verified_pm25 DOUBLE PRECISION CHECK (admin_verified_pm25 BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS public_lat DOUBLE PRECISION CHECK (public_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS public_lon DOUBLE PRECISION CHECK (public_lon BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS camera_session_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS clock_warning BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ocr_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rejection_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS moderation_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_purged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  ADD COLUMN IF NOT EXISTS rating_average DOUBLE PRECISION CHECK (rating_average BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS policy_version TEXT NOT NULL DEFAULT 'trust-v1';

ALTER TABLE community_reports
  ALTER COLUMN image_path DROP NOT NULL,
  ALTER COLUMN image_sha256 DROP NOT NULL;

UPDATE community_reports
SET admin_verified_pm25 = pm25
WHERE admin_verified_pm25 IS NULL AND pm25 IS NOT NULL;

UPDATE community_reports
SET camera_session_issued_at = captured_at,
    client_captured_at = captured_at
WHERE camera_session_issued_at IS NULL OR client_captured_at IS NULL;

INSERT INTO report_evidence (
  report_id, exact_lat, exact_lon, gps_accuracy_m, capture_session_id,
  camera_session_issued_at, client_captured_at, server_received_at,
  image_path, image_sha256, image_ahash, burst_hashes, ocr_raw_text,
  retention_until, audit_hold, created_at
)
SELECT
  id, lat, lon, gps_accuracy_m, capture_session_id,
  COALESCE(camera_session_issued_at, captured_at),
  COALESCE(client_captured_at, captured_at),
  COALESCE(server_received_at, created_at),
  image_path, image_sha256, image_ahash, burst_hashes, ocr_raw_text,
  retention_until, audit_hold, created_at
FROM community_reports
ON CONFLICT (report_id) DO NOTHING;

ALTER TABLE report_reviews
  ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_direction TEXT CHECK (rating_direction IN ('negative', 'neutral', 'positive')),
  ADD COLUMN IF NOT EXISTS consensus_matched BOOLEAN;

UPDATE report_reviews
SET rating = CASE WHEN verdict = 'confirm' THEN 5 ELSE 1 END,
    rating_direction = CASE WHEN verdict = 'confirm' THEN 'positive' ELSE 'negative' END
WHERE rating IS NULL;

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '/',
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  deduplication_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, deduplication_key)
);
CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
  ON user_notifications (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES user_notifications(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON notification_outbox (next_attempt_at) WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS public_map_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('report_approved', 'report_updated', 'report_expired')),
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS public_map_events_time_idx
  ON public_map_events (created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'public_map_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public_map_events;
  END IF;
END $$;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived', 'expired')),
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS report_status_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rating_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reward_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS leaderboard_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS announcement_alerts BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_map_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_read_own ON user_notifications;
CREATE POLICY user_notifications_read_own ON user_notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS public_map_events_read ON public_map_events;
CREATE POLICY public_map_events_read ON public_map_events
  FOR SELECT TO anon, authenticated USING (TRUE);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-images', 'announcement-images', TRUE, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION moderate_community_report_v2(
  p_report_id UUID,
  p_admin_id UUID,
  p_decision TEXT,
  p_verified_pm25 DOUBLE PRECISION,
  p_rejection_reason_code TEXT,
  p_checks JSONB,
  p_note TEXT,
  p_trust_score DOUBLE PRECISION,
  p_trust_reasons JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target community_reports%ROWTYPE;
  updated community_reports%ROWTYPE;
  next_status TEXT;
  event_points INTEGER := 0;
  invalid_rejects INTEGER := 0;
  event_reason TEXT;
  notification_id UUID := gen_random_uuid();
  dedupe_key TEXT;
BEGIN
  SELECT * INTO target FROM community_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
  IF target.status <> 'pending' THEN RAISE EXCEPTION 'report_already_moderated'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  next_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  IF next_status = 'approved' THEN
    IF p_verified_pm25 IS NULL THEN RAISE EXCEPTION 'verified_pm25_required'; END IF;
    IF NOT COALESCE((p_checks->>'image_clear')::BOOLEAN, FALSE)
       OR NOT COALESCE((p_checks->>'value_matches_display')::BOOLEAN, FALSE)
       OR NOT COALESCE((p_checks->>'location_plausible')::BOOLEAN, FALSE)
       OR NOT COALESCE((p_checks->>'no_screen_recapture_signs')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'moderation_checklist_incomplete';
    END IF;
  ELSIF p_rejection_reason_code IS NULL THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE community_reports
  SET status = next_status,
      pm25 = CASE WHEN next_status = 'approved' THEN p_verified_pm25 ELSE NULL END,
      admin_verified_pm25 = CASE WHEN next_status = 'approved' THEN p_verified_pm25 ELSE NULL END,
      base_trust_score = CASE WHEN next_status = 'approved' THEN p_trust_score ELSE base_trust_score END,
      trust_score = CASE WHEN next_status = 'approved' THEN p_trust_score ELSE trust_score END,
      trust_reasons = CASE WHEN next_status = 'approved' THEN p_trust_reasons ELSE trust_reasons END,
      moderated_by = p_admin_id,
      moderation_note = p_note,
      rejection_reason_code = CASE WHEN next_status = 'rejected' THEN p_rejection_reason_code ELSE NULL END,
      moderation_checks = COALESCE(p_checks, '{}'::jsonb),
      moderated_at = NOW(),
      updated_at = NOW(),
      retention_until = NOW() + CASE WHEN next_status = 'approved' THEN INTERVAL '180 days' ELSE INTERVAL '30 days' END,
      policy_version = 'trust-v2'
  WHERE id = p_report_id
  RETURNING * INTO updated;

  UPDATE report_evidence
  SET retention_until = updated.retention_until
  WHERE report_id = p_report_id;

  IF next_status = 'approved' THEN
    event_points := 10;
    event_reason := 'report_approved';
    INSERT INTO public_map_events(id, event_type, entity_id)
    VALUES (gen_random_uuid(), 'report_approved', p_report_id);
  ELSIF p_rejection_reason_code IN (
    'value_mismatch', 'suspected_screen_recapture', 'invalid_location', 'duplicate'
  ) THEN
    SELECT COUNT(*) INTO invalid_rejects
    FROM reputation_events
    WHERE user_id = target.user_id AND reason = 'report_rejected_invalid';
    event_points := -5 - LEAST(invalid_rejects * 2, 10);
    event_reason := 'report_rejected_invalid';
  ELSE
    event_points := 0;
    event_reason := 'report_rejected_technical';
  END IF;
  PERFORM apply_reputation_event(
    target.user_id, event_points, event_reason, target.id,
    'moderation:v2:' || target.id::text
  );

  IF COALESCE((
    SELECT report_status_alerts FROM notification_preferences
    WHERE user_id = target.user_id
  ), TRUE) THEN
    dedupe_key := 'report_status:' || target.id::text;
    INSERT INTO user_notifications(
    id, user_id, event_type, title, body, url, entity_type, entity_id,
    payload, deduplication_key
  ) VALUES (
    notification_id, target.user_id, 'report_status',
    CASE WHEN next_status = 'approved' THEN 'รายงานได้รับการอนุมัติ' ELSE 'รายงานไม่ผ่านการตรวจ' END,
    CASE WHEN next_status = 'approved'
      THEN 'ข้อมูล PM2.5 ของคุณเผยแพร่บนแผนที่แล้ว'
      ELSE 'เปิดดูเหตุผลและคำแนะนำก่อนส่งรายงานครั้งถัดไป' END,
    '/', 'community_report', target.id::text,
    jsonb_build_object('status', next_status, 'reason_code', p_rejection_reason_code),
    dedupe_key
    ) ON CONFLICT (user_id, deduplication_key) DO NOTHING;
    SELECT id INTO notification_id FROM user_notifications
    WHERE user_id = target.user_id AND deduplication_key = dedupe_key;
    INSERT INTO notification_outbox(id, user_id, notification_id, event_key, payload)
    VALUES (
      gen_random_uuid(), target.user_id, notification_id, dedupe_key,
      jsonb_build_object('title', CASE WHEN next_status = 'approved' THEN 'รายงานได้รับการอนุมัติ' ELSE 'รายงานไม่ผ่านการตรวจ' END, 'url', '/')
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;

  INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES (
    p_admin_id, 'report_' || next_status, 'community_report', target.id::text,
    jsonb_build_object(
      'note', p_note,
      'verified_pm25', p_verified_pm25,
      'rejection_reason_code', p_rejection_reason_code,
      'checks', p_checks,
      'policy_version', 'trust-v2'
    )
  );
  RETURN to_jsonb(updated);
END;
$$;

REVOKE ALL ON FUNCTION moderate_community_report_v2(
  UUID, UUID, TEXT, DOUBLE PRECISION, TEXT, JSONB, TEXT, DOUBLE PRECISION, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION moderate_community_report_v2(
  UUID, UUID, TEXT, DOUBLE PRECISION, TEXT, JSONB, TEXT, DOUBLE PRECISION, JSONB
) TO service_role;

COMMIT;
