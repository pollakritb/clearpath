BEGIN;

ALTER TABLE sync_runs
  ADD COLUMN IF NOT EXISTS rejected_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS forecast_provider_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('openweather', 'openmeteo_cams')),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  station_count INTEGER NOT NULL DEFAULT 0,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS forecast_provider_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID REFERENCES forecast_provider_sync_runs(id) ON DELETE SET NULL,
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openweather', 'openmeteo_cams')),
  issued_at TIMESTAMPTZ NOT NULL,
  forecast_at TIMESTAMPTZ NOT NULL,
  horizon_hours INTEGER NOT NULL CHECK (horizon_hours BETWEEN 0 AND 168),
  pm25 DOUBLE PRECISION NOT NULL CHECK (pm25 >= 0),
  unit TEXT NOT NULL DEFAULT 'µg/m³' CHECK (unit = 'µg/m³'),
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, provider, issued_at, forecast_at)
);

CREATE INDEX IF NOT EXISTS idx_provider_snapshot_station_forecast
  ON forecast_provider_snapshots(station_id, forecast_at DESC, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_snapshot_provider_issued
  ON forecast_provider_snapshots(provider, issued_at DESC);

CREATE TABLE IF NOT EXISTS forecast_consensus_latest (
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  horizon_hours INTEGER NOT NULL CHECK (horizon_hours BETWEEN 1 AND 168),
  generated_at TIMESTAMPTZ NOT NULL,
  forecast_at TIMESTAMPTZ NOT NULL,
  pm25 DOUBLE PRECISION NOT NULL CHECK (pm25 >= 0),
  lower DOUBLE PRECISION NOT NULL CHECK (lower >= 0),
  upper DOUBLE PRECISION NOT NULL CHECK (upper >= lower),
  agreement TEXT NOT NULL CHECK (agreement IN ('high', 'medium', 'low')),
  provider_count INTEGER NOT NULL DEFAULT 0,
  community_report_count INTEGER NOT NULL DEFAULT 0,
  community_effective_sample_size DOUBLE PRECISION NOT NULL DEFAULT 0,
  community_weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'weighted-median-community-residual-v1',
  unavailable_reason_codes TEXT[] NOT NULL DEFAULT '{}',
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (station_id, horizon_hours)
);

CREATE TABLE IF NOT EXISTS forecast_prediction_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  horizon_hours INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  pm25 DOUBLE PRECISION NOT NULL CHECK (pm25 >= 0),
  lower DOUBLE PRECISION,
  upper DOUBLE PRECISION,
  weight DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (weight >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_prediction_sources_station_generated
  ON forecast_prediction_sources(station_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS community_forecast_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL,
  report_ids UUID[] NOT NULL DEFAULT '{}',
  report_count INTEGER NOT NULL DEFAULT 0,
  effective_sample_size DOUBLE PRECISION NOT NULL DEFAULT 0,
  residual_pm25 DOUBLE PRECISION NOT NULL DEFAULT 0,
  community_weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  quality_summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_community_forecast_station_generated
  ON community_forecast_feature_snapshots(station_id, generated_at DESC);

ALTER TABLE forecast_provider_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_provider_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_consensus_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_prediction_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_forecast_feature_snapshots ENABLE ROW LEVEL SECURITY;

COMMIT;
