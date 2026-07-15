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
-- (optional) PostGIS — เผื่ออยากทำ spatial query ในอนาคต
-- CREATE EXTENSION IF NOT EXISTS postgis;
-- ALTER TABLE stations ADD COLUMN geom geography(Point,4326);
-- UPDATE stations SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326);
-- ───────────────────────────────────────────────────────────
