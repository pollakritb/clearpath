-- ClearPath production PM2.5 forecast hardening (additive, server-only).
-- ML remains disabled by configuration until shadow/canary evidence is approved.

BEGIN;

ALTER TABLE stations ADD COLUMN IF NOT EXISTS district TEXT;

-- Every source row carries event time, ingestion time and an explicit state.
ALTER TABLE pm25_readings
  ADD COLUMN IF NOT EXISTS source_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_status TEXT NOT NULL DEFAULT 'observed';
UPDATE pm25_readings SET source_at = recorded_at WHERE source_at IS NULL;
ALTER TABLE pm25_readings ALTER COLUMN source_at SET NOT NULL;

ALTER TABLE weather_observations
  ADD COLUMN IF NOT EXISTS source_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_status TEXT NOT NULL DEFAULT 'observed';
UPDATE weather_observations SET source_at = recorded_at WHERE source_at IS NULL;
ALTER TABLE weather_observations ALTER COLUMN source_at SET NOT NULL;

ALTER TABLE weather_forecasts
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_status TEXT NOT NULL DEFAULT 'observed';

ALTER TABLE fire_feature_snapshots
  ADD COLUMN IF NOT EXISTS source_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_status TEXT NOT NULL DEFAULT 'observed';
UPDATE fire_feature_snapshots SET source_at = recorded_at WHERE source_at IS NULL;
ALTER TABLE fire_feature_snapshots ALTER COLUMN source_at SET NOT NULL;

DO $$
DECLARE target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'pm25_readings', 'weather_observations', 'weather_forecasts',
    'fire_feature_snapshots'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      target_table,
      target_table || '_source_status_check'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK '
      || '(source_status IN (''observed'', ''missing'', ''unavailable'', '
      || '''not_applicable'', ''invalid'')) NOT VALID',
      target_table,
      target_table || '_source_status_check'
    );
    EXECUTE format(
      'ALTER TABLE %I VALIDATE CONSTRAINT %I',
      target_table,
      target_table || '_source_status_check'
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS forecast_data_quality_daily (
  quality_date DATE NOT NULL,
  source_name TEXT NOT NULL,
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  expected_hours INTEGER NOT NULL CHECK (expected_hours >= 0),
  observed_hours INTEGER NOT NULL CHECK (observed_hours >= 0),
  missing_hours INTEGER NOT NULL CHECK (missing_hours >= 0),
  duplicate_hours INTEGER NOT NULL CHECK (duplicate_hours >= 0),
  invalid_rows INTEGER NOT NULL CHECK (invalid_rows >= 0),
  newest_source_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (quality_date, source_name, station_id)
);

-- Registry is the sole activation authority. Checksums are mandatory for any
-- lifecycle state beyond candidate/rejected.
ALTER TABLE model_registry
  DROP CONSTRAINT IF EXISTS model_registry_activation_status_check;
ALTER TABLE model_registry
  ADD CONSTRAINT model_registry_activation_status_check CHECK (
    activation_status IN (
      'candidate', 'shadow', 'canary', 'active', 'retired', 'rejected'
    )
  );
ALTER TABLE model_registry
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS artifact_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS feature_schema_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS dataset_manifest_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS model_card_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS code_release_sha TEXT,
  ADD COLUMN IF NOT EXISTS calibration_version TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE model_registry
  DROP CONSTRAINT IF EXISTS model_registry_model_name_horizon_hours_version_key;
ALTER TABLE model_registry
  ADD CONSTRAINT model_registry_release_environment_key UNIQUE (
    model_name, horizon_hours, version, environment
  );
ALTER TABLE model_registry
  ADD CONSTRAINT model_registry_environment_check CHECK (
    environment IN ('staging', 'production')
  ) NOT VALID,
  ADD CONSTRAINT model_registry_checksum_shape_check CHECK (
    (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[0-9a-f]{64}$') AND
    (feature_schema_sha256 IS NULL OR feature_schema_sha256 ~ '^[0-9a-f]{64}$') AND
    (dataset_manifest_sha256 IS NULL OR dataset_manifest_sha256 ~ '^[0-9a-f]{64}$')
  ) NOT VALID,
  ADD CONSTRAINT model_registry_promoted_integrity_check CHECK (
    activation_status IN ('candidate', 'rejected') OR (
      artifact_sha256 IS NOT NULL AND
      feature_schema_sha256 IS NOT NULL AND
      dataset_manifest_sha256 IS NOT NULL AND
      code_release_sha IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE model_registry
  VALIDATE CONSTRAINT model_registry_environment_check;
ALTER TABLE model_registry
  VALIDATE CONSTRAINT model_registry_checksum_shape_check;
ALTER TABLE model_registry
  VALIDATE CONSTRAINT model_registry_promoted_integrity_check;
CREATE UNIQUE INDEX IF NOT EXISTS model_registry_one_active_per_horizon_env_idx
  ON model_registry (model_name, horizon_hours, environment)
  WHERE activation_status = 'active';
CREATE INDEX IF NOT EXISTS model_registry_runtime_lookup_idx
  ON model_registry (environment, horizon_hours, activation_status, updated_at DESC);

ALTER TABLE forecast_runs
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS feature_version TEXT,
  ADD COLUMN IF NOT EXISTS artifact_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS source_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS input_freshness_minutes DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS feature_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS latency_ms DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS request_id TEXT;

ALTER TABLE forecast_predictions
  ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT 'served',
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'baseline',
  ADD COLUMN IF NOT EXISTS model_version TEXT,
  ADD COLUMN IF NOT EXISTS artifact_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS calibration_version TEXT,
  ADD COLUMN IF NOT EXISTS coverage_target DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS baseline_pm25 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS observed_pm25 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS absolute_error DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS squared_error DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS signed_error DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS category_correct BOOLEAN,
  ADD COLUMN IF NOT EXISTS false_safe BOOLEAN,
  ADD COLUMN IF NOT EXISTS interval_covered BOOLEAN,
  ADD COLUMN IF NOT EXISTS interval_width DOUBLE PRECISION;
ALTER TABLE forecast_predictions
  DROP CONSTRAINT IF EXISTS forecast_predictions_variant_check;
ALTER TABLE forecast_predictions
  ADD CONSTRAINT forecast_predictions_variant_check CHECK (
    variant IN ('served', 'shadow')
  ) NOT VALID;
ALTER TABLE forecast_predictions
  VALIDATE CONSTRAINT forecast_predictions_variant_check;
ALTER TABLE forecast_predictions
  DROP CONSTRAINT IF EXISTS forecast_predictions_pkey;
ALTER TABLE forecast_predictions
  ADD PRIMARY KEY (run_id, horizon_hours, variant);
CREATE INDEX IF NOT EXISTS forecast_predictions_unsettled_idx
  ON forecast_predictions (forecast_at)
  WHERE settled_at IS NULL;

CREATE TABLE IF NOT EXISTS forecast_false_safe_reviews (
  run_id UUID NOT NULL,
  horizon_hours INTEGER NOT NULL CHECK (horizon_hours IN (1, 3, 6, 12, 24)),
  variant TEXT NOT NULL CHECK (variant IN ('served', 'shadow')),
  disposition TEXT NOT NULL CHECK (
    disposition IN (
      'expected_edge_case', 'source_data_issue', 'model_issue', 'safety_incident'
    )
  ),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 1000),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, horizon_hours, variant),
  FOREIGN KEY (run_id, horizon_hours, variant)
    REFERENCES forecast_predictions(run_id, horizon_hours, variant)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS forecast_false_safe_reviews_reviewed_idx
  ON forecast_false_safe_reviews (reviewed_at DESC);

CREATE TABLE IF NOT EXISTS forecast_evaluation_daily (
  evaluation_date DATE NOT NULL,
  environment TEXT NOT NULL,
  horizon_hours INTEGER NOT NULL CHECK (horizon_hours IN (1, 3, 6, 12, 24)),
  method TEXT NOT NULL,
  station_id TEXT NOT NULL DEFAULT 'all',
  district TEXT NOT NULL DEFAULT 'all',
  rows INTEGER NOT NULL CHECK (rows >= 0),
  mae DOUBLE PRECISION,
  rmse DOUBLE PRECISION,
  bias DOUBLE PRECISION,
  category_accuracy DOUBLE PRECISION,
  false_safe_rate DOUBLE PRECISION,
  interval_coverage DOUBLE PRECISION,
  fallback_rate DOUBLE PRECISION,
  p95_latency_ms DOUBLE PRECISION,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (
    evaluation_date, environment, horizon_hours, method, station_id, district
  )
);

CREATE TABLE IF NOT EXISTS forecast_drift_snapshots (
  id UUID PRIMARY KEY,
  environment TEXT NOT NULL,
  model_version TEXT,
  horizon_hours INTEGER NOT NULL CHECK (horizon_hours IN (1, 3, 6, 12, 24)),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  feature_drift JSONB NOT NULL DEFAULT '{}'::jsonb,
  prediction_drift JSONB NOT NULL DEFAULT '{}'::jsonb,
  missingness JSONB NOT NULL DEFAULT '{}'::jsonb,
  alert_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (environment, horizon_hours, model_version, window_start, window_end)
);

CREATE TABLE IF NOT EXISTS forecast_release_decisions (
  id UUID PRIMARY KEY,
  registry_id UUID REFERENCES model_registry(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (
    decision IN ('approve_shadow', 'approve_canary', 'promote', 'rollback', 'reject')
  ),
  environment TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Authenticated users can report incorrect public information without sending
-- images, precise coordinates, email addresses or other contact data. Only the
-- server-side moderator API can read this private queue.
CREATE TABLE IF NOT EXISTS data_issue_reports (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN ('station', 'forecast', 'map', 'community', 'other')
  ),
  reference_id TEXT CHECK (reference_id IS NULL OR length(reference_id) <= 100),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 1000),
  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'reviewing', 'resolved', 'dismissed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS data_issue_reports_status_created_idx
  ON data_issue_reports (status, created_at DESC);

-- Atomic promotion permits only an explicitly approved canary. It never runs
-- from the registration script and records who made the release decision.
CREATE OR REPLACE FUNCTION transition_forecast_model(
  p_registry_id UUID,
  p_approved_by UUID,
  p_decision TEXT,
  p_reason TEXT,
  p_evidence JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target model_registry%ROWTYPE;
  next_status TEXT;
BEGIN
  IF p_decision NOT IN ('approve_shadow', 'approve_canary', 'reject') THEN
    RAISE EXCEPTION 'release_decision_unsupported';
  END IF;
  IF length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'release_reason_too_short';
  END IF;
  SELECT * INTO target FROM model_registry WHERE id = p_registry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'registry_model_not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(
    target.model_name || ':' || target.horizon_hours || ':' || target.environment
  ));
  IF p_decision = 'approve_shadow' AND target.activation_status = 'candidate' THEN
    next_status := 'shadow';
  ELSIF p_decision = 'approve_canary' AND target.activation_status = 'shadow' THEN
    next_status := 'canary';
  ELSIF p_decision = 'reject'
        AND target.activation_status IN ('candidate', 'shadow', 'canary') THEN
    next_status := 'rejected';
  ELSE
    RAISE EXCEPTION 'release_transition_not_allowed';
  END IF;
  IF next_status IN ('shadow', 'canary') AND (
    target.artifact_sha256 IS NULL OR target.feature_schema_sha256 IS NULL
    OR target.dataset_manifest_sha256 IS NULL OR target.code_release_sha IS NULL
  ) THEN
    RAISE EXCEPTION 'registry_model_integrity_incomplete';
  END IF;
  IF next_status IN ('shadow', 'canary') THEN
    UPDATE model_registry
    SET activation_status = 'retired', retired_at = NOW(), updated_at = NOW(),
        status_reason = 'superseded_' || next_status || ':' || p_registry_id::text
    WHERE id <> p_registry_id
      AND model_name = target.model_name
      AND horizon_hours = target.horizon_hours
      AND environment = target.environment
      AND activation_status = next_status;
  END IF;
  UPDATE model_registry
  SET activation_status = next_status,
      approved_by = p_approved_by,
      approved_at = NOW(),
      retired_at = CASE WHEN next_status = 'rejected' THEN NOW() ELSE NULL END,
      status_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_registry_id
  RETURNING * INTO target;
  INSERT INTO forecast_release_decisions(
    id, registry_id, decision, environment, actor_id, reason, evidence
  ) VALUES (
    gen_random_uuid(), target.id, p_decision, target.environment,
    p_approved_by, p_reason, COALESCE(p_evidence, '{}'::jsonb)
  );
  RETURN to_jsonb(target);
END;
$$;

CREATE OR REPLACE FUNCTION promote_forecast_model(
  p_registry_id UUID,
  p_approved_by UUID,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target model_registry%ROWTYPE;
BEGIN
  SELECT * INTO target FROM model_registry WHERE id = p_registry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'registry_model_not_found'; END IF;
  IF target.activation_status <> 'canary' THEN
    RAISE EXCEPTION 'registry_model_not_canary';
  END IF;
  IF target.artifact_sha256 IS NULL OR target.feature_schema_sha256 IS NULL
     OR target.dataset_manifest_sha256 IS NULL OR target.code_release_sha IS NULL THEN
    RAISE EXCEPTION 'registry_model_integrity_incomplete';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(
    target.model_name || ':' || target.horizon_hours || ':' || target.environment
  ));
  UPDATE model_registry
  SET activation_status = 'retired', retired_at = NOW(), updated_at = NOW(),
      status_reason = 'superseded:' || p_registry_id::text
  WHERE model_name = target.model_name
    AND horizon_hours = target.horizon_hours
    AND environment = target.environment
    AND activation_status = 'active';
  UPDATE model_registry
  SET activation_status = 'active', approved_by = p_approved_by,
      approved_at = NOW(), retired_at = NULL, updated_at = NOW(),
      status_reason = p_reason
  WHERE id = p_registry_id
  RETURNING * INTO target;
  INSERT INTO forecast_release_decisions(
    id, registry_id, decision, environment, actor_id, reason
  ) VALUES (
    gen_random_uuid(), target.id, 'promote', target.environment,
    p_approved_by, p_reason
  );
  RETURN to_jsonb(target);
END;
$$;

CREATE OR REPLACE FUNCTION rollback_forecast_model(
  p_target_registry_id UUID,
  p_approved_by UUID,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target model_registry%ROWTYPE;
BEGIN
  SELECT * INTO target FROM model_registry
  WHERE id = p_target_registry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rollback_model_not_found'; END IF;
  IF target.activation_status NOT IN ('retired', 'canary') THEN
    RAISE EXCEPTION 'rollback_target_not_eligible';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(
    target.model_name || ':' || target.horizon_hours || ':' || target.environment
  ));
  UPDATE model_registry
  SET activation_status = 'retired', retired_at = NOW(), updated_at = NOW(),
      status_reason = 'rollback_replaced:' || p_target_registry_id::text
  WHERE model_name = target.model_name
    AND horizon_hours = target.horizon_hours
    AND environment = target.environment
    AND activation_status = 'active';
  UPDATE model_registry
  SET activation_status = 'active', approved_by = p_approved_by,
      approved_at = NOW(), retired_at = NULL, updated_at = NOW(),
      status_reason = p_reason
  WHERE id = p_target_registry_id
  RETURNING * INTO target;
  INSERT INTO forecast_release_decisions(
    id, registry_id, decision, environment, actor_id, reason
  ) VALUES (
    gen_random_uuid(), target.id, 'rollback', target.environment,
    p_approved_by, p_reason
  );
  RETURN to_jsonb(target);
END;
$$;

REVOKE ALL ON FUNCTION promote_forecast_model(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rollback_forecast_model(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION transition_forecast_model(UUID, UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION promote_forecast_model(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION rollback_forecast_model(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION transition_forecast_model(UUID, UUID, TEXT, TEXT, JSONB)
  TO service_role;

ALTER TABLE forecast_data_quality_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_false_safe_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_evaluation_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_drift_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_release_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_issue_reports ENABLE ROW LEVEL SECURITY;

COMMIT;
