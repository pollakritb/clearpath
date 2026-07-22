-- ClearPath production foundation
-- Intentionally resets pre-production community data. Official stations and
-- pm25_readings are not modified.

BEGIN;

DELETE FROM storage.objects WHERE bucket_id = 'report-images';

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS alert_events CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS forecast_predictions CASCADE;
DROP TABLE IF EXISTS forecast_runs CASCADE;
DROP TABLE IF EXISTS model_registry CASCADE;
DROP TABLE IF EXISTS fire_feature_snapshots CASCADE;
DROP TABLE IF EXISTS weather_forecasts CASCADE;
DROP TABLE IF EXISTS weather_observations CASCADE;
DROP TABLE IF EXISTS sync_runs CASCADE;
DROP TABLE IF EXISTS rate_limit_windows CASCADE;
DROP TABLE IF EXISTS reputation_events CASCADE;
DROP TABLE IF EXISTS report_reviews CASCADE;
DROP TABLE IF EXISTS community_reports CASCADE;
DROP TABLE IF EXISTS capture_sessions CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT CHECK (char_length(display_name) <= 80),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  reputation_score INTEGER NOT NULL DEFAULT 0 CHECK (reputation_score >= 0),
  approved_reports INTEGER NOT NULL DEFAULT 0 CHECK (approved_reports >= 0),
  helpful_reviews INTEGER NOT NULL DEFAULT 0 CHECK (helpful_reviews >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE capture_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > issued_at)
);
CREATE INDEX capture_sessions_user_expiry_idx
  ON capture_sessions (user_id, expires_at DESC);

CREATE TABLE community_reports (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name TEXT,
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
  province TEXT NOT NULL DEFAULT 'นครปฐม',
  district TEXT,
  subdistrict TEXT,
  pm25 DOUBLE PRECISION CHECK (pm25 BETWEEN 0 AND 1000),
  ocr_pm25 DOUBLE PRECISION CHECK (ocr_pm25 BETWEEN 0 AND 1000),
  ocr_confidence DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (ocr_confidence BETWEEN 0 AND 1),
  ocr_raw_text TEXT,
  device_detected BOOLEAN NOT NULL DEFAULT FALSE,
  display_clear BOOLEAN NOT NULL DEFAULT FALSE,
  capture_source TEXT NOT NULL DEFAULT 'camera' CHECK (capture_source = 'camera'),
  capture_session_id UUID NOT NULL UNIQUE REFERENCES capture_sessions(id),
  image_path TEXT NOT NULL,
  image_sha256 TEXT NOT NULL UNIQUE,
  image_ahash TEXT,
  burst_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_of_report_id UUID REFERENCES community_reports(id) ON DELETE SET NULL,
  device_model TEXT,
  device_serial TEXT,
  device_calibrated BOOLEAN NOT NULL DEFAULT FALSE,
  calibration_evidence_path TEXT,
  calibrated_at DATE,
  averaging_period TEXT NOT NULL DEFAULT 'instant'
    CHECK (averaging_period IN ('instant', '1_minute', '5_minutes')),
  measurement_duration_seconds INTEGER NOT NULL DEFAULT 0
    CHECK (measurement_duration_seconds BETWEEN 0 AND 600),
  measurement_environment TEXT NOT NULL DEFAULT 'outdoor'
    CHECK (measurement_environment = 'outdoor'),
  measurement_stable BOOLEAN NOT NULL DEFAULT TRUE,
  near_emission_source BOOLEAN NOT NULL DEFAULT FALSE,
  measurement_note TEXT CHECK (char_length(measurement_note) <= 300),
  gps_accuracy_m DOUBLE PRECISION CHECK (gps_accuracy_m >= 0),
  captured_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  base_trust_score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (base_trust_score BETWEEN 0 AND 100),
  trust_score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN 0 AND 100),
  trust_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  peer_up INTEGER NOT NULL DEFAULT 0,
  peer_down INTEGER NOT NULL DEFAULT 0,
  moderated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  moderation_note TEXT,
  moderated_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  audit_hold BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approved_requires_pm25 CHECK (status <> 'approved' OR pm25 IS NOT NULL),
  CONSTRAINT pending_has_no_verified_pm25 CHECK (status <> 'pending' OR pm25 IS NULL),
  CONSTRAINT calibrated_requires_metadata CHECK (
    NOT device_calibrated OR calibrated_at IS NOT NULL
  )
);
CREATE INDEX community_reports_status_time_idx ON community_reports (status, created_at DESC);
CREATE INDEX community_reports_location_idx ON community_reports (lat, lon);
CREATE INDEX community_reports_user_time_idx ON community_reports (user_id, created_at DESC);

CREATE TABLE report_reviews (
  id BIGSERIAL PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('confirm', 'dispute')),
  reason_code TEXT NOT NULL,
  reviewer_distance_km DOUBLE PRECISION NOT NULL CHECK (reviewer_distance_km >= 0),
  gps_accuracy_m DOUBLE PRECISION,
  note TEXT,
  weight DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 5),
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, reviewer_id)
);

CREATE TABLE reputation_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_id UUID REFERENCES community_reports(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX reputation_events_weekly_idx ON reputation_events (created_at DESC, user_id);

CREATE TABLE announcements (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'community' CHECK (kind IN ('news', 'alert', 'community')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'watch', 'warning')),
  area TEXT,
  district TEXT,
  subdistrict TEXT,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE activities (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rule_code TEXT,
  target_count INTEGER CHECK (target_count IS NULL OR target_count > 0),
  reward_points INTEGER NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sync_runs (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  fetched_count INTEGER NOT NULL DEFAULT 0,
  station_count INTEGER NOT NULL DEFAULT 0,
  reading_count INTEGER NOT NULL DEFAULT 0,
  source_recorded_at TIMESTAMPTZ,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX sync_runs_source_started_idx ON sync_runs (source, started_at DESC);

CREATE TABLE rate_limit_windows (
  actor_key TEXT NOT NULL,
  action TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (actor_key, action, window_started_at)
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  user_agent TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  district TEXT,
  subdistrict TEXT,
  radius_km DOUBLE PRECISION CHECK (radius_km IS NULL OR radius_km BETWEEN 1 AND 50),
  center_lat DOUBLE PRECISION,
  center_lon DOUBLE PRECISION,
  pm25_threshold DOUBLE PRECISION NOT NULL DEFAULT 37.5,
  air_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  hotspot_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  community_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alert_events (
  id UUID PRIMARY KEY,
  deduplication_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  district TEXT,
  subdistrict TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  detected_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE weather_observations (
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  wind_speed DOUBLE PRECISION,
  wind_deg DOUBLE PRECISION,
  rain_mm DOUBLE PRECISION,
  PRIMARY KEY (station_id, recorded_at)
);

CREATE TABLE weather_forecasts (
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL,
  forecast_at TIMESTAMPTZ NOT NULL,
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  wind_speed DOUBLE PRECISION,
  wind_deg DOUBLE PRECISION,
  rain_mm DOUBLE PRECISION,
  PRIMARY KEY (station_id, issued_at, forecast_at)
);

CREATE TABLE fire_feature_snapshots (
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  hotspot_count INTEGER NOT NULL DEFAULT 0,
  weighted_frp DOUBLE PRECISION NOT NULL DEFAULT 0,
  upwind_hotspot_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, recorded_at)
);

CREATE TABLE model_registry (
  id UUID PRIMARY KEY,
  model_name TEXT NOT NULL,
  horizon_hours INTEGER NOT NULL CHECK (horizon_hours IN (1, 3, 6, 12, 24)),
  version TEXT NOT NULL,
  feature_version TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  train_start TIMESTAMPTZ NOT NULL,
  train_end TIMESTAMPTZ NOT NULL,
  source_rows INTEGER NOT NULL,
  completeness DOUBLE PRECISION NOT NULL,
  baseline_mae DOUBLE PRECISION NOT NULL,
  model_mae DOUBLE PRECISION NOT NULL,
  baseline_category_accuracy DOUBLE PRECISION NOT NULL,
  model_category_accuracy DOUBLE PRECISION NOT NULL,
  activation_status TEXT NOT NULL CHECK (activation_status IN ('candidate', 'active', 'rejected')),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_name, horizon_hours, version)
);

CREATE TABLE forecast_runs (
  id UUID PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL,
  method TEXT NOT NULL,
  model_version TEXT,
  fallback_reason TEXT,
  data_quality TEXT NOT NULL,
  source_points INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE forecast_predictions (
  run_id UUID NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  horizon_hours INTEGER NOT NULL,
  forecast_at TIMESTAMPTZ NOT NULL,
  pm25 DOUBLE PRECISION NOT NULL,
  lower DOUBLE PRECISION NOT NULL,
  upper DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (run_id, horizon_hours)
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION consume_capture_session(
  p_session_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE capture_sessions
  SET consumed_at = NOW()
  WHERE id = p_session_id
    AND user_id = p_user_id
    AND consumed_at IS NULL
    AND expires_at >= NOW();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION take_rate_limit(
  p_actor_key TEXT,
  p_action TEXT,
  p_window_seconds INTEGER,
  p_limit INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket TIMESTAMPTZ;
  current_count INTEGER;
BEGIN
  bucket := to_timestamp(
    floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds
  );
  INSERT INTO rate_limit_windows(actor_key, action, window_started_at, request_count)
  VALUES (p_actor_key, p_action, bucket, 1)
  ON CONFLICT (actor_key, action, window_started_at)
  DO UPDATE SET request_count = rate_limit_windows.request_count + 1
  RETURNING request_count INTO current_count;
  RETURN current_count <= p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION apply_reputation_event(
  p_user_id UUID,
  p_points INTEGER,
  p_reason TEXT,
  p_report_id UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result profiles%ROWTYPE;
BEGIN
  INSERT INTO reputation_events(user_id, report_id, points, reason, idempotency_key)
  VALUES (p_user_id, p_report_id, p_points, p_reason, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO result FROM profiles WHERE id = p_user_id;
    RETURN to_jsonb(result);
  END IF;
  UPDATE profiles
  SET reputation_score = GREATEST(0, reputation_score + p_points),
      approved_reports = approved_reports + CASE WHEN p_reason = 'report_approved' THEN 1 ELSE 0 END,
      helpful_reviews = helpful_reviews + CASE WHEN p_reason = 'helpful_review' THEN 1 ELSE 0 END,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;

CREATE OR REPLACE FUNCTION moderate_community_report(
  p_report_id UUID,
  p_admin_id UUID,
  p_decision TEXT,
  p_verified_pm25 DOUBLE PRECISION,
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
  event_points INTEGER;
BEGIN
  SELECT * INTO target FROM community_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
  IF target.status <> 'pending' THEN RAISE EXCEPTION 'report_already_moderated'; END IF;
  next_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  IF next_status = 'approved' AND p_verified_pm25 IS NULL THEN
    RAISE EXCEPTION 'verified_pm25_required';
  END IF;
  UPDATE community_reports
  SET status = next_status,
      pm25 = CASE WHEN next_status = 'approved' THEN p_verified_pm25 ELSE NULL END,
      base_trust_score = CASE WHEN next_status = 'approved' THEN p_trust_score ELSE base_trust_score END,
      trust_score = CASE WHEN next_status = 'approved' THEN p_trust_score ELSE trust_score END,
      trust_reasons = CASE WHEN next_status = 'approved' THEN p_trust_reasons ELSE trust_reasons END,
      moderated_by = p_admin_id,
      moderation_note = p_note,
      moderated_at = NOW(),
      updated_at = NOW(),
      retention_until = NOW() + CASE WHEN next_status = 'approved' THEN INTERVAL '180 days' ELSE INTERVAL '30 days' END
  WHERE id = p_report_id
  RETURNING * INTO updated;
  event_points := CASE WHEN next_status = 'approved' THEN 10 ELSE -5 END;
  PERFORM apply_reputation_event(
    target.user_id, event_points, 'report_' || next_status, target.id,
    'moderation:' || target.id::text
  );
  INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES (
    p_admin_id, 'report_' || next_status, 'community_report', target.id::text,
    jsonb_build_object('note', p_note, 'verified_pm25', p_verified_pm25)
  );
  RETURN to_jsonb(updated);
END;
$$;

REVOKE ALL ON FUNCTION consume_capture_session(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION take_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_reputation_event(UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION moderate_community_report(UUID, UUID, TEXT, DOUBLE PRECISION, TEXT, DOUBLE PRECISION, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_capture_session(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION take_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION apply_reputation_event(UUID, INTEGER, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION moderate_community_report(UUID, UUID, TEXT, DOUBLE PRECISION, TEXT, DOUBLE PRECISION, JSONB) TO service_role;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_own ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-images', 'report-images', FALSE, 8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
