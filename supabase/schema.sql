-- ClearPath — Supabase / PostgreSQL schema
-- รันใน Supabase SQL Editor หรือผ่าน migration

-- ───────────────────────────────────────────────────────────
-- stations: ข้อมูลสถานี + ค่า PM2.5 "ปัจจุบัน" (denormalized)
--   cron upsert ทุกชั่วโมง → /api/pm25/current อ่านตารางนี้ตรงๆ (เร็ว)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stations (
  id           TEXT PRIMARY KEY,          -- stationID จาก air4thai (เช่น "01t")
  name_th      TEXT,
  name_en      TEXT,
  lat          DOUBLE PRECISION NOT NULL,
  lon          DOUBLE PRECISION NOT NULL,
  province     TEXT,
  pm25         DOUBLE PRECISION,          -- ค่าล่าสุด
  aqi          INTEGER,
  color        TEXT,                      -- สีตามมาตรฐาน (เขียว/เหลือง/...)
  level        TEXT,                      -- ระดับ (ดี/ปานกลาง/...)
  recorded_at  TIMESTAMPTZ,               -- เวลาที่ air4thai บันทึกค่านี้
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────
-- pm25_readings: ประวัติรายชั่วโมง (append-only) → กราฟย้อนหลัง
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pm25_readings (
  id           BIGSERIAL PRIMARY KEY,
  station_id   TEXT REFERENCES stations(id) ON DELETE CASCADE,
  pm25         DOUBLE PRECISION,
  aqi          INTEGER,
  recorded_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  -- กัน insert ซ้ำเมื่อ cron รันทับช่วงเวลาเดิม
  UNIQUE (station_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_readings_station_time
  ON pm25_readings (station_id, recorded_at DESC);

-- ───────────────────────────────────────────────────────────
-- Legacy bootstrap community tables; the production migration replaces this
-- section with auth.users-backed UUID profiles and RLS.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                TEXT PRIMARY KEY,
  display_name      TEXT,
  reputation_score  INTEGER NOT NULL DEFAULT 0 CHECK (reputation_score >= 0),
  approved_reports  INTEGER NOT NULL DEFAULT 0,
  helpful_reviews   INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- รายงานทุกชิ้นเริ่ม pending และเผยแพร่หลัง admin อนุมัติเท่านั้น
CREATE TABLE IF NOT EXISTS community_reports (
  id                 UUID PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name       TEXT,
  lat                DOUBLE PRECISION NOT NULL,
  lon                DOUBLE PRECISION NOT NULL,
  -- ระหว่าง pending เป็น internal placeholder; เมื่อ approved จะเป็นค่าที่ Admin อ่านจากภาพ
  pm25               DOUBLE PRECISION NOT NULL CHECK (pm25 BETWEEN 0 AND 1000),
  ocr_pm25           DOUBLE PRECISION,
  ocr_confidence     DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (ocr_confidence BETWEEN 0 AND 1),
  ocr_raw_text       TEXT,
  device_detected    BOOLEAN NOT NULL DEFAULT FALSE,
  display_clear      BOOLEAN NOT NULL DEFAULT FALSE,
  capture_source     TEXT NOT NULL CHECK (capture_source IN ('camera', 'upload')),
  capture_session_id TEXT,
  image_path         TEXT NOT NULL,
  image_sha256       TEXT,
  image_ahash        TEXT,
  duplicate_of_report_id UUID REFERENCES community_reports(id) ON DELETE SET NULL,
  device_model       TEXT,
  device_calibrated  BOOLEAN NOT NULL DEFAULT FALSE,
  calibrated_at      DATE,
  measurement_environment TEXT NOT NULL DEFAULT 'outdoor' CHECK (measurement_environment IN ('outdoor', 'indoor')),
  measurement_stable BOOLEAN NOT NULL DEFAULT TRUE,
  near_emission_source BOOLEAN NOT NULL DEFAULT FALSE,
  measurement_note   TEXT,
  gps_accuracy_m     DOUBLE PRECISION,
  captured_at        TIMESTAMPTZ NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  base_trust_score   DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (base_trust_score BETWEEN 0 AND 100),
  trust_score        DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN 0 AND 100),
  trust_reasons      JSONB NOT NULL DEFAULT '[]'::jsonb,
  peer_up            INTEGER NOT NULL DEFAULT 0,
  peer_down          INTEGER NOT NULL DEFAULT 0,
  moderated_by       TEXT,
  moderation_note    TEXT,
  moderated_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_reports_status_time
  ON community_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reports_location
  ON community_reports (lat, lon);
CREATE INDEX IF NOT EXISTS idx_community_reports_user_time
  ON community_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reports_image_sha
  ON community_reports (image_sha256) WHERE image_sha256 IS NOT NULL;

-- migration-safe additions for databases created from an earlier MVP schema
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS capture_session_id TEXT;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS image_sha256 TEXT;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS image_ahash TEXT;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS duplicate_of_report_id UUID REFERENCES community_reports(id) ON DELETE SET NULL;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS device_model TEXT;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS device_calibrated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS calibrated_at DATE;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS measurement_environment TEXT NOT NULL DEFAULT 'outdoor';
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS measurement_stable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS near_emission_source BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS measurement_note TEXT;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS gps_accuracy_m DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS report_reviews (
  id           BIGSERIAL PRIMARY KEY,
  report_id    UUID NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
  reviewer_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  verdict      TEXT NOT NULL CHECK (verdict IN ('confirm', 'dispute')),
  reason_code  TEXT,
  reviewer_distance_km DOUBLE PRECISION,
  note         TEXT,
  weight       DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, reviewer_id)
);

ALTER TABLE report_reviews ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE report_reviews ADD COLUMN IF NOT EXISTS reviewer_distance_km DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS reputation_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_id   UUID REFERENCES community_reports(id) ON DELETE SET NULL,
  points      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id            UUID PRIMARY KEY,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'community' CHECK (kind IN ('news', 'alert', 'community')),
  area          TEXT,
  published     BOOLEAN NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS activities (
  id             UUID PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  reward_points  INTEGER NOT NULL DEFAULT 0,
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- private bucket: backend service_role อัปโหลดและออก signed URL เท่านั้น
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-images',
  'report-images',
  FALSE,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────
-- (optional) PostGIS — เผื่ออยากทำ spatial query ในอนาคต
-- CREATE EXTENSION IF NOT EXISTS postgis;
-- ALTER TABLE stations ADD COLUMN geom geography(Point,4326);
-- UPDATE stations SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326);
-- ───────────────────────────────────────────────────────────
