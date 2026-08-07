# ClearPath Production PM2.5 Forecast Plan

วันที่จัดทำ: 2026-08-03
สถานะเอกสาร: Working implementation plan
ขอบเขต: พยากรณ์ PM2.5 ระยะสั้น 1–24 ชั่วโมงสำหรับจังหวัดนครปฐม
เอกสารที่เกี่ยวข้อง: `README.md`, `docs/runbooks/pilot-and-model-rollout.md`,
`docs/superpowers/specs/2026-07-15-clearpath-forecast-community-design.md`

---

## 1. เป้าหมายของแผน

สร้างระบบพยากรณ์ PM2.5 ที่ใช้ประกอบการตัดสินใจได้จริง โดยต้อง:

1. พยากรณ์รายสถานีที่ horizon 1, 3, 6, 12 และ 24 ชั่วโมง
2. แสดงค่ากลาง ช่วงความไม่แน่นอน เวลาที่สร้าง รุ่นโมเดล และคุณภาพข้อมูล
3. สร้างพื้นผิวพยากรณ์บนแผนที่ด้วย IDW แบบ haversine จากค่าพยากรณ์รายสถานี
4. ใช้ Air4Thai เป็นข้อมูลหลัก และใช้ข้อมูลชุมชนเป็น supplementary ตามกฎ Trust เท่านั้น
5. ไม่แสดง ML เกินจริงเมื่อข้อมูลหรือ artifact ไม่พร้อม
6. fallback ไป deterministic baseline ได้เสมอโดย API ไม่ล้ม
7. ประเมินแบบ temporal/rolling backtest โดยไม่มีข้อมูลอนาคตรั่ว
8. ตรวจความแม่นยำแยกตาม horizon, สถานี, อำเภอ, ฤดูกาล และวันที่ฝุ่นสูง
9. มี shadow deployment, canary rollout, monitoring, drift detection และ rollback
10. อธิบายผลแก่ผู้ใช้ได้โดยไม่ทำให้เข้าใจว่าเป็นคำเตือนสุขภาพแบบรับประกัน

## 2. สิ่งที่ไม่อยู่ในขอบเขต

- ระบบนำทางหรือเปรียบเทียบเส้นทาง
- การยืนยันว่า satellite hotspot คือเหตุไฟไหม้จริง
- การใช้ Kriging ใน production deployment
- การใช้ภาพหรือพิกัดจริงของรายงานชุมชนเป็น feature สาธารณะ
- การเปิด ML อัตโนมัติโดยไม่มี human release approval
- การแทนที่ประกาศหรือคำแนะนำอย่างเป็นทางการจากหน่วยงานรัฐ

## 3. สถานะปัจจุบัน

### 3.1 สิ่งที่มีแล้ว

- `GET /api/forecast?station_id=&hours=1..24`
- deterministic baseline `damped-local-trend-v1`
- ML direct horizons 1, 3, 6, 12 และ 24 ชั่วโมง
- feature ปัจจุบัน: PM2.5 lags, ค่าเฉลี่ย/แนวโน้ม 6 ชั่วโมง, เวลา, เดือน,
  weather และ satellite hotspot aggregate
- offline XGBoost training และ neutral JSON artifact ที่ production อ่านได้โดยไม่ deploy XGBoost
- activation gate ขั้นต่ำ:
  - history ≥90 วัน
  - source examples ≥1,500
  - temporal test examples ≥300
  - ≥3 สถานี
  - ≥6 observed months
  - completeness ≥80%
  - per-station temporal holdout
  - MAE ดีกว่า persistence ≥5%
  - category accuracy ไม่ถอยเกิน 2 percentage points
- fallback reasons เช่น `ml_forecast_disabled`, `artifact_not_found`,
  `required_features_missing`, `inference_failed`
- residual interval แบบ 5th–95th percentile
- export, train และ model registration scripts
- hourly sync cron และ 30-minute alert cron
- Admin model status และ model registry schema

### 3.2 สถานะการเปิดใช้งาน

- baseline ใช้งานได้
- ML ต้องคง `ML_FORECAST_ENABLED=false` จนกว่าแผนนี้จะผ่าน Phase 0–8
- Production preflight ล่าสุดยังไม่พร้อม เพราะ Supabase table checks ได้ `ConnectError`
- ยังไม่มีหลักฐาน multi-season backtest และ field/shadow validation
- Implementation snapshot วันที่ 3 สิงหาคม 2026: เสร็จ 131/161 งาน เหลือ 30 งานที่
  ต้องใช้ owner, production account/secrets, observation window, field device,
  incident drill หรือ human/legal/health approval; ดูขั้นตอนใน
  `CLEARPATH_REMAINING_STEPS.txt`
- External evidence ของงานเปิดทั้ง 30 รายการมี JSON template และ fail-closed
  validator แล้ว รวมถึง operational-log secret/PII scanner และ baseline
  rollback verifier; เครื่องมือเหล่านี้ไม่ใช้แทน owner หรือ live evidence
- Field evidence มีตัววิเคราะห์ co-location และ official-only เทียบ community
  แบบ de-identified/fail-closed; runtime sampler เก็บเฉพาะ aggregate
  availability/fallback/latency โดยยังต้องใช้ device, Vercel และ field evidence จริง

### 3.3 ช่องว่างที่พบจากโค้ดปัจจุบัน

รายการต่อไปนี้ต้องแก้ก่อนเรียกว่า production-grade:

- [x] `FCAST-GAP-001` Training มีเพียง 80/20 temporal holdout ครั้งเดียว ยังไม่มี rolling-origin backtest
- [x] `FCAST-GAP-002` Missing weather/fire ถูกแปลงเป็นศูนย์ ทำให้แยก “ไม่มีข้อมูล” กับ “ค่าจริงเป็นศูนย์” ไม่ได้
- [x] `FCAST-GAP-003` Time feature ใช้ hour จาก timestamp โดยตรง ต้องยืนยัน/แปลงเป็น `Asia/Bangkok`
- [x] `FCAST-GAP-004` Category thresholds ใน training ซ้ำกับค่าคงที่ ต้องใช้ source เดียวกับ `backend/core/aqi.py`
- [x] `FCAST-GAP-005` Completeness และ station count metrics อาจนับสถานี/ช่วงเวลาที่ไม่ได้สร้าง example จริง
- [x] `FCAST-GAP-006` Registry ยังไม่เป็นตัวตัดสิน active artifact ที่ inference ใช้จริง
- [x] `FCAST-GAP-007` Artifact registration ยังไม่มี SHA-256 และ feature-schema checksum ที่ตรวจตอนโหลด
- [x] `FCAST-GAP-008` Uncertainty เป็น residual รวม ยังไม่ได้ calibrate แยก horizon/station/season
- [x] `FCAST-GAP-009` API `data_quality` ใช้เพียงจำนวน source points ยังไม่ตรวจ freshness, gaps และ feature completeness
- [x] `FCAST-GAP-010` ยังไม่มี forecast weather ที่ตรงกับอนาคตแต่ละ horizon
- [x] `FCAST-GAP-011` ยังไม่มี station/spatial context และ nearest-station features
- [x] `FCAST-GAP-012` ยังไม่มี forecast surface endpoint สำหรับแผนที่ทั้งจังหวัด
- [x] `FCAST-GAP-013` ยังไม่มี persistent prediction ledger สำหรับจับคู่ prediction กับ observation จริง
- [x] `FCAST-GAP-014` ยังไม่มี automated drift/accuracy alerts และ retraining policy
- [x] `FCAST-GAP-015` export/train/register scripts ยังต้องเพิ่ม unit/integration tests
- [x] `FCAST-GAP-016` model artifact cache ต้องมี version-aware invalidation/rollback behavior ที่ทดสอบแล้ว

---

## 4. หลักการที่ห้ามละเมิด

1. Supabase เป็น source of truth
2. Air4Thai ถูกเรียกผ่าน hourly cron เท่านั้น
3. Algorithms ต้องเป็น pure functions และมี unit tests
4. Production interpolation ใช้ IDW + haversine
5. Kriging ใช้เฉพาะ local evaluation
6. ห้าม random split ข้ามเวลา
7. ห้าม train ด้วยข้อมูลหลัง prediction timestamp
8. ห้ามเปิด ML ถ้า gate หรือ artifact validation ไม่ผ่าน
9. ห้ามให้ ML failure ทำ API ล้ม ต้อง fallback พร้อมเหตุผล
10. Community เป็น supplementary และต้องผ่าน approved/fresh/Trust/corroboration policy
11. ห้ามใช้พิกัดจริงหรือ private evidence ฝั่ง browser
12. ทุก forecast ต้องบอก `generated_at`, `forecast_at`, method, data quality และ uncertainty

---

## 5. Product contract

### 5.1 Prediction target

- Target: hourly PM2.5 concentration หน่วย µg/m³
- Entity: Air4Thai station ใน service polygon นครปฐม
- Direct horizons: 1, 3, 6, 12, 24 ชั่วโมง
- UI สามารถแสดงจุดรายชั่วโมง 1–24 ชั่วโมง โดยใช้ direct-horizon anchor และ baseline/interpolation
  ตาม contract ที่กำหนด ห้ามแอบอ้างว่าทุกชั่วโมงมาจากโมเดลแยกตัว
- Forecast surface: IDW จาก station-level prediction ของ horizon เดียวกัน

### 5.2 API response ขั้นต่ำ

ต่อ forecast point ต้องมี:

- `forecast_at`
- `pm25`
- `lower`
- `upper`
- `horizon_hours`
- `method`
- `model_version` หรือ `null`
- `data_quality`
- `fallback_reason` หรือ `null`
- `source_recorded_at`
- `input_freshness_minutes`

Response ระดับชุดต้องเพิ่มในอนาคต:

- `feature_version`
- `artifact_sha256`
- `interval_coverage_target`
- `station_coverage`
- `warnings[]`

### 5.3 UX language

- ใช้คำว่า “พยากรณ์” หรือ “แนวโน้ม” ไม่ใช้ “ค่าที่จะเกิดขึ้นแน่นอน”
- แสดงช่วงความไม่แน่นอนเสมอ
- แสดง “อัปเดตเมื่อ” และ “ข้อมูลล่าสุดเมื่อ” แยกกัน
- เมื่อ fallback ให้แสดงว่าเป็น baseline ไม่ซ่อนสถานะ
- เมื่อข้อมูลเก่าหรือพื้นที่ห่างสถานี ให้ขึ้นคำเตือนชัดเจน
- Satellite hotspot ต้องเรียกว่า “จุดความร้อนจากดาวเทียม”

---

## 6. Data architecture

```text
Vercel hourly cron
  ├─ Air4Thai official observations
  ├─ Weather observations + forecasts
  └─ Satellite hotspot snapshots
          ↓
Supabase source-of-truth tables
          ↓
Data-quality validation + hourly feature snapshots
          ↓
Read-only training export
          ↓
Offline training / rolling backtest / calibration
          ↓
Signed neutral JSON artifacts + registry candidate
          ↓
Shadow inference + prediction ledger
          ↓
Approval → canary → production
          ↓
Monitoring / drift / rollback / retraining
```

### 6.1 Required source tables

- `stations`
- `pm25_readings`
- `weather_observations`
- `weather_forecasts`
- `fire_feature_snapshots`
- `model_registry`

### 6.2 Tables/fields to add or confirm

#### `forecast_predictions`

- prediction ID
- station ID
- generated timestamp
- source timestamp
- forecast timestamp
- horizon
- predicted PM2.5
- lower/upper interval
- method
- model version
- feature version
- artifact SHA-256
- data-quality summary
- fallback reason
- observed PM2.5 เมื่อ target time มาถึง
- absolute/squared error
- category match
- created/settled timestamps

#### `forecast_evaluation_runs`

- evaluation window
- model/horizon/version
- station/area/season slice
- row count
- MAE, RMSE, bias
- category accuracy
- threshold recall/precision
- interval coverage/width
- baseline metrics
- drift metrics
- pass/fail/reasons

#### `forecast_feature_snapshots` (ถ้าคำนวณ on-demand ไม่เสถียร)

- station/hour key
- source timestamps
- normalized feature payload
- missingness flags
- feature version
- data-quality flags

ทุก schema change ต้องเป็น additive migration และมี TS/Pydantic contract ตรงกันเมื่อถูกส่งผ่าน API

---

## 7. Workstreams และลำดับดำเนินงาน

## Phase 0 — Ownership, scope และ release safety

เป้าหมาย: มีเจ้าของ การตัดสินใจ และ rollback authority ก่อนทำงานข้อมูลจริง

### Tasks

- [ ] `FCAST-0001` ระบุ Product Owner
- [ ] `FCAST-0002` ระบุ Data/ML Owner
- [ ] `FCAST-0003` ระบุ Production/Incident Owner
- [ ] `FCAST-0004` ระบุผู้อนุมัติ health communication/privacy
- [x] `FCAST-0005` ยืนยัน horizons 1/3/6/12/24
- [x] `FCAST-0006` ยืนยัน threshold ที่ UI/alert ใช้จาก source กลางเดียว
- [ ] `FCAST-0007` กำหนด rollback authority และช่องทางแจ้งเหตุ
- [x] `FCAST-0008` สร้าง decision log สำหรับ model releases

### Deliverables

- Owner list
- Release approval template
- Rollback decision tree
- Forecast claim/wording ที่อนุมัติแล้ว

### Exit criteria

- ทุก role มีชื่อผู้รับผิดชอบ
- มีผู้ที่สามารถปิด `ML_FORECAST_ENABLED` และ redeploy ได้

---

## Phase 1 — Production data foundation

เป้าหมาย: เก็บข้อมูล official/weather/fire ได้ต่อเนื่องและตรวจสอบย้อนกลับได้

### User/Infrastructure tasks

- [ ] `FCAST-0101` ทำ Supabase staging และ production แยก project
- [ ] `FCAST-0102` apply additive schema/migrations อย่างปลอดภัย
- [ ] `FCAST-0103` ตั้ง server/browser Supabase credentials ให้ถูก project
- [ ] `FCAST-0104` ตั้ง `CRON_SECRET` และ cron plan ที่รองรับ hourly/30-minute schedule
- [ ] `FCAST-0105` ตั้ง OpenWeather และ FIRMS keys
- [ ] `FCAST-0106` ยืนยัน `LOCAL_DEMO_MODE=false` ใน staging/production
- [ ] `FCAST-0107` เปิด monitoring ของ cron และ upstream errors

### Engineering tasks

- [x] `FCAST-0110` เพิ่ม source timestamp, ingestion timestamp และ source status ทุก record
- [x] `FCAST-0111` เพิ่ม idempotency/deduplication tests สำหรับ hourly sync
- [x] `FCAST-0112` ตรวจ timezone normalization เป็น UTC ใน storage
- [x] `FCAST-0113` ตรวจ station service-area filtering
- [x] `FCAST-0114` ตรวจ weather/fire join key และ tolerance รอบชั่วโมง
- [x] `FCAST-0115` เพิ่ม reconciliation job ตรวจ missing hours/duplicate hours
- [x] `FCAST-0116` เพิ่ม Admin data-quality summary ราย source/station/day

### Verification

```powershell
.venv\Scripts\python -m scripts.production_preflight --env-file .env.local --json --strict-features
.venv\Scripts\python -m scripts.verify_deployment https://<STAGING_HOST>
```

### Exit criteria

- `/api/ready` เป็น 200 ต่อเนื่อง
- สถานี official ล่าสุดไม่เก่าเกิน 90 นาที
- Cron success ≥99% ในช่วง acceptance 14 วัน
- ไม่มี duplicate station-hour keys
- PM2.5 completeness ≥95% สำหรับสถานีที่เลือกทำ pilot
- Weather completeness ≥90%
- Fire feature pipeline แยก “ไม่มี hotspot” ออกจาก “source unavailable” ได้

---

## Phase 2 — Data-quality contract และ dataset readiness

เป้าหมาย: มีเกณฑ์ตัดสินว่าแถวใด train/infer ได้ โดยไม่ silently impute ผิดความหมาย

### Tasks

- [x] `FCAST-0201` สร้าง pure data-quality evaluator
- [x] `FCAST-0202` กำหนด valid ranges ต่อ feature
- [x] `FCAST-0203` แยก missing, unavailable, not-applicable และค่าศูนย์จริง
- [x] `FCAST-0204` เพิ่ม missingness flags ต่อ weather/fire feature
- [x] `FCAST-0205` กำหนด gap policy สำหรับ PM2.5 lags
- [x] `FCAST-0206` กำหนด outlier policy โดยไม่ลบ high-pollution event จริง
- [x] `FCAST-0207` ตรวจ station relocations/device changes
- [x] `FCAST-0208` สร้าง dataset manifest พร้อม row/station/date/month counts
- [x] `FCAST-0209` แก้ completeness calculation ให้คำนวณจาก raw expected station-hours
- [x] `FCAST-0210` นับเฉพาะสถานีที่มี usable examples ใน gate
- [x] `FCAST-0211` เพิ่ม export manifest SHA-256
- [x] `FCAST-0212` ทำ data leakage audit checklist

### Suggested validity checks

- PM2.5 ต้องไม่ติดลบ
- Timestamp ต้องเรียงและไม่ซ้ำต่อสถานี
- Lag window ต้องไม่ข้าม gap เกิน policy
- Wind direction ต้อง normalize 0–360
- Rain/hotspot count ต้องแยก missing กับ zero
- Feature source timestamp ต้องไม่เกิน prediction timestamp
- Forecast-weather issued time ต้องไม่เกิน prediction timestamp

### Exit criteria

- Dataset export สร้าง manifest เดิมซ้ำได้จาก snapshot เดียวกัน
- ทุก excluded row มี reason code
- ไม่มี future leakage จาก join หรือ feature computation
- รายงาน completeness แยก station/month/source ได้

---

## Phase 3 — Baseline hardening

เป้าหมาย: มี baseline ที่น่าเชื่อถือเพื่อเป็น safety fallback และคู่แข่งของ ML

### Baselines ที่ต้องมี

1. Persistence: ค่าล่าสุด
2. Seasonal naive: เวลาเดียวกันของวันก่อน/สัปดาห์ก่อน เมื่อข้อมูลพร้อม
3. Damped local trend: baseline ปัจจุบัน
4. Rolling/diurnal climatology: ค่าเฉลี่ยตาม station/hour/month

### Tasks

- [x] `FCAST-0301` ทำ baseline evaluators เป็น pure functions
- [x] `FCAST-0302` ใช้ centralized AQI/category thresholds
- [x] `FCAST-0303` เพิ่ม freshness/gap handling
- [x] `FCAST-0304` calibrate baseline intervals แยก horizon
- [x] `FCAST-0305` เพิ่ม baseline tests สำหรับ spike, flat, missing, irregular timestamps
- [x] `FCAST-0306` สร้าง baseline leaderboard แยก horizon/station/season
- [x] `FCAST-0307` กำหนด champion baseline ต่อ horizon

### Exit criteria

- Baseline ทุกตัว deterministic และ unit-tested
- Safety fallback ไม่ใช้ข้อมูลเก่าเกิน policy โดยไม่เตือน
- มี baseline metric ที่ reproducible สำหรับทุก horizon

---

## Phase 4 — Feature engineering v2

เป้าหมาย: สร้าง feature ที่มี causal availability และทำงานตรงกันระหว่าง train/inference

### Temporal features

- PM2.5 lags 1, 2, 3, 6, 12, 24, 48, 72 ชั่วโมงตาม data availability
- rolling median/mean/min/max/std 3, 6, 12, 24 ชั่วโมง
- robust slopes และ recent acceleration
- hour-of-day/day-of-week/month/season ใน `Asia/Bangkok`
- holiday/event flag เฉพาะเมื่อมี source ที่ดูแลได้

### Weather features

- temperature, humidity, wind speed/direction, rain, pressure ถ้ามี
- circular encoding ของ wind direction
- weather forecast สำหรับ target horizon โดยใช้ issued-at ที่ถูกต้อง
- missing/source-age flags

### Fire features

- hotspot count ภายในหลายรัศมี
- weighted FRP
- upwind hotspot count
- min/weighted distance
- hotspot age buckets ≤12 ชั่วโมง
- source-unavailable flag

### Spatial features

- station latitude/longitude แบบ server-side feature
- nearest official station values/distances
- regional median/trend
- distance-to-neighbour features ด้วย haversine
- station identity handling ที่ไม่ overfit สถานีเดียว

### Tasks

- [x] `FCAST-0401` ออก `forecast-features-v2` contract
- [x] `FCAST-0402` ทำ train/inference parity tests
- [x] `FCAST-0403` เพิ่ม missingness indicators
- [x] `FCAST-0404` เพิ่ม Bangkok local-time conversion tests
- [x] `FCAST-0405` เพิ่ม forecast-weather point-in-time join
- [x] `FCAST-0406` เพิ่ม neighbour/spatial features แบบ pure
- [x] `FCAST-0407` ตรวจ feature importance และ leakage
- [x] `FCAST-0408` version schema + checksum

### Exit criteria

- Feature vector เดียวกันให้ค่าเท่ากันใน offline และ production
- ทุก feature มี source, availability time, unit และ missing policy
- ไม่มี private/community exact coordinates ออกจาก server

---

## Phase 5 — Training and rolling backtest pipeline

เป้าหมาย: ประเมินเหมือนการใช้งานในอนาคตจริง ไม่ใช่เพียง split ครั้งเดียว

### Data minimum

Hard gate ปัจจุบัน:

- ≥90 history days
- ≥1,500 usable examples
- ≥300 holdout examples
- ≥3 stations
- ≥6 observed months
- ≥80% completeness

Production recommendation:

- ≥12 เดือน เพื่อครอบคลุมฤดูฝน/แล้งอย่างน้อยหนึ่งรอบ
- ควรมี 18–24 เดือนเมื่อหาได้
- ครอบคลุม high-pollution episodes และ sparse-data periods

### Tasks

- [x] `FCAST-0501` ทำ rolling-origin folds รายสถานี
- [x] `FCAST-0502` แยก final untouched holdout
- [x] `FCAST-0503` เพิ่ม station holdout/generalization experiment
- [x] `FCAST-0504` เพิ่ม seasonal and district slices
- [x] `FCAST-0505` เพิ่ม reproducible seeds/config manifest
- [x] `FCAST-0506` ทำ hyperparameter search ภายใต้ compute budget
- [x] `FCAST-0507` compare XGBoost กับทุก baseline
- [x] `FCAST-0508` เก็บ fold-level predictions ไม่ใช่เฉพาะ aggregate metrics
- [x] `FCAST-0509` สร้าง model card ต่อ release
- [x] `FCAST-0510` เพิ่ม CLI tests และ failure-mode tests

### Required metrics

- MAE
- RMSE
- Median absolute error
- Bias/mean error
- Category accuracy
- Threshold precision/recall โดยเฉพาะระดับที่กระทบสุขภาพ
- False-safe rate: ทำนายต่ำแต่ค่าจริงสูง
- Interval empirical coverage
- Mean interval width
- Metrics แยก horizon/station/district/season/PM band
- Fallback and missing-feature rate

### Exit criteria

- ML MAE ดีกว่า champion persistence/baseline ≥5% ทุก horizon ที่จะเปิด
- Category accuracy ไม่ถอยเกิน 2 percentage points
- ไม่มี unacceptable false-safe slice
- Interval coverage อยู่ใน tolerance ที่กำหนด
- ผลแต่ละ fold และ artifact สามารถ reproduce ได้

---

## Phase 6 — Uncertainty calibration

เป้าหมาย: ช่วง `lower/upper` มีความหมายเชิงสถิติและไม่แคบเกินจริง

### Tasks

- [x] `FCAST-0601` วัด empirical coverage ของ residual interval ปัจจุบัน
- [x] `FCAST-0602` calibrate แยก horizon
- [x] `FCAST-0603` ทดสอบ calibration แยก season/PM band/station coverage
- [x] `FCAST-0604` พิจารณา conformal หรือ quantile calibration แบบ offline
- [x] `FCAST-0605` กำหนด minimum interval width เมื่อ data quality ต่ำ
- [x] `FCAST-0606` ส่ง coverage target/version ผ่าน contract
- [x] `FCAST-0607` ออก UX rule เมื่อ interval กว้างมาก

### Exit criteria

- Coverage บน untouched holdout อยู่ในเกณฑ์อนุมัติ
- ไม่มี slice สำคัญที่ interval แคบผิดปกติ
- UI แสดง uncertainty และ warning ได้ชัดเจน

---

## Phase 7 — Artifact, registry และ supply-chain safety

เป้าหมาย: เฉพาะ artifact ที่อนุมัติและตรวจ integrity แล้วเท่านั้นที่ production โหลด

### Tasks

- [x] `FCAST-0701` เพิ่ม artifact SHA-256
- [x] `FCAST-0702` เพิ่ม feature-schema checksum
- [x] `FCAST-0703` เพิ่ม training dataset manifest hash
- [x] `FCAST-0704` บันทึก code/release SHA
- [x] `FCAST-0705` เพิ่ม registry statuses: candidate, shadow, canary, active, retired, rejected
- [x] `FCAST-0706` ให้ inference ตรวจ registry active status ไม่ใช่ตรวจ local gate อย่างเดียว
- [x] `FCAST-0707` บังคับหนึ่ง active version ต่อ horizon/environment
- [x] `FCAST-0708` ตรวจ horizon/version/feature names/tree schema ตอนโหลด
- [x] `FCAST-0709` ทำ version-aware cache invalidation
- [x] `FCAST-0710` ทำ atomic promotion/rollback procedure
- [x] `FCAST-0711` ป้องกัน `--apply` เปิดใช้งานโดยอัตโนมัติ
- [x] `FCAST-0712` เพิ่ม artifact corruption/tampering tests

### Exit criteria

- เปลี่ยนไฟล์หลัง register แล้วระบบปฏิเสธ
- Registry ไม่ active แล้ว inference ใช้ artifact ไม่ได้
- Rollback ไป version ก่อนหน้าได้และมี audit trail
- XGBoost ไม่เข้า production dependency bundle

---

## Phase 8 — Inference and API hardening

เป้าหมาย: API ถูกต้อง เสถียร อธิบายได้ และ fallback อย่างปลอดภัย

### Tasks

- [x] `FCAST-0801` เพิ่ม input freshness/gap validator
- [x] `FCAST-0802` เพิ่ม feature-quality summary
- [x] `FCAST-0803` เพิ่ม source timestamp ใน response
- [x] `FCAST-0804` เพิ่ม model/feature/artifact metadata
- [x] `FCAST-0805` เพิ่ม structured fallback reason codes
- [x] `FCAST-0806` เพิ่ม prediction bounds/sanity checks
- [x] `FCAST-0807` เพิ่ม timeout/error handling โดยไม่ leak traceback
- [x] `FCAST-0808` เพิ่ม prediction ledger แบบ async/non-blocking
- [x] `FCAST-0809` เพิ่ม station batch forecast service
- [x] `FCAST-0810` เพิ่ม forecast surface service ด้วย IDW haversine
- [x] `FCAST-0811` เพิ่ม sparse-area/coverage mask
- [x] `FCAST-0812` เพิ่ม API contract tests และ load tests

### Surface forecast rules

- ใช้เฉพาะ station forecasts ของ horizon เดียวกัน
- ใช้ official stations เป็นแกนหลัก
- Community forecast surface ใช้ได้ในอนาคตเฉพาะข้อมูลที่ผ่าน policy และต้องติด label supplementary
- ถ้าสถานีสดไม่พอ ให้ไม่สร้าง surface หรือขึ้น low-coverage warning
- ห้าม extrapolate เป็นความแม่นยำระดับบ้าน

### Exit criteria

- ทุก failure mode คืน baseline หรือ controlled 422/502/503 ตาม contract
- ไม่มี 500 จาก artifact/input ที่คาดการณ์ได้
- Latency p95 และ function memory อยู่ใน SLO
- Forecast surface ผ่าน unit validation และ sparse-area tests

---

## Phase 9 — Product UX และ accessibility

เป้าหมาย: ผู้ใช้เข้าใจความหมายของ forecast, uncertainty และข้อจำกัดบน mobile

### Tasks

- [x] `FCAST-0901` ออก forecast card สำหรับ 1/3/6/12/24 ชั่วโมง
- [x] `FCAST-0902` แสดงค่ากลาง + ช่วง uncertainty
- [x] `FCAST-0903` แสดง last observation กับ forecast generated time แยกกัน
- [x] `FCAST-0904` แสดง baseline/ML/fallback อย่างซื่อสัตย์
- [x] `FCAST-0905` เพิ่ม forecast map horizon selector
- [x] `FCAST-0906` แสดง coverage/sparse-area warning
- [x] `FCAST-0907` เพิ่ม list/table accessible alternative ให้แผนที่
- [x] `FCAST-0908` ทดสอบ 360/390/430 px, large text และ high contrast
- [x] `FCAST-0909` ทดสอบ screen reader labels และ color-independent AQI states
- [ ] `FCAST-0910` ผ่าน health/privacy wording review

### Exit criteria

- ผู้ทดสอบอธิบายได้ว่าตัวเลขเป็น forecast ไม่ใช่ observation
- ทุกหน้ามี timestamp, uncertainty และ data-quality state
- ไม่มี serious/critical accessibility violations
- ไม่ใช้สีอย่างเดียวในการบอกอันตราย

---

## Phase 10 — Shadow evaluation

เป้าหมาย: สร้าง prediction จริงต่อเนื่องโดยยังไม่แสดง ML แก่ผู้ใช้

### Duration

- อย่างน้อย 14 วันสำหรับระบบ
- แนะนำ 30 วันและต้องมีช่วงค่าฝุ่นหลายระดับ
- ยังไม่ถือว่า multi-season complete จนผ่านฤดูฝนและฤดูแล้ง

### Tasks

- [x] `FCAST-1001` บันทึก ML + baseline predictions ทุก horizon
- [x] `FCAST-1002` settle observation หลัง target time
- [x] `FCAST-1003` คำนวณ daily/weekly metrics
- [x] `FCAST-1004` monitor latency/error/fallback
- [ ] `FCAST-1005` review false-safe cases แบบรายเหตุการณ์
  - เครื่องมือพร้อม: private Admin queue, disposition/note, audit log และ mobile review cards
  - ยังรอ: settled production events และการตรวจของผู้รับผิดชอบทุกเคส
- [x] `FCAST-1006` ตรวจ interval coverage
- [x] `FCAST-1007` ตรวจ metrics แยก station/district
- [ ] `FCAST-1008` บันทึก release decision
  - เครื่องมือพร้อม: atomic shadow/canary/reject/promote/rollback RPC, evidence JSON และ Admin history
  - ยังรอ: ผล shadow จริงและการอนุมัติ release โดย owner

### Stop conditions

- Exact/private community location รั่ว
- Forecast pipeline กระทบ observation API
- Artifact integrity ไม่ผ่าน
- False-safe รุนแรง
- ML แย่กว่า baseline ต่อเนื่องตาม policy
- Fallback หรือ missing-feature rate สูงเกิน threshold

### Exit criteria

- ไม่มี critical safety/privacy incident
- ML ผ่าน gate บน live settled predictions
- Operational SLO ผ่าน
- Product/Data/Operations ลงนามอนุมัติ canary

---

## Phase 11 — Canary rollout

เป้าหมาย: เปิด ML อย่างควบคุมและย้อนกลับได้

### Rollout steps

1. Staging internal only
2. Production shadow
3. 10% eligible forecast requests/stations
4. 25%
5. 50%
6. 100%

แต่ละขั้นต้องมี observation window และ approval ใหม่ ห้ามเพิ่มสัดส่วนอัตโนมัติจากเวลาอย่างเดียว

### Tasks

- [x] `FCAST-1101` เพิ่ม environment/percentage/station allowlist gate
- [x] `FCAST-1102` เพิ่ม canary vs baseline comparison dashboard
- [ ] `FCAST-1103` ทดสอบ rollback drill
- [ ] `FCAST-1104` ตรวจ logs ไม่มี secret/PII
- [x] `FCAST-1105` บันทึกผู้อนุมัติและเวลา promotion

### Rollback

1. ตั้ง `ML_FORECAST_ENABLED=false`
2. Redeploy
3. ตรวจ API `method`, `model_version=null`, `fallback_reason`
4. ตรวจ readiness และ baseline responses
5. เก็บ artifact/prediction ledger เพื่อทำ root-cause analysis

### Exit criteria

- Rollback เสร็จภายใน operational target
- ไม่มี request error spike
- Live accuracy ไม่ถอยจาก shadow threshold

---

## Phase 12 — Monitoring, drift และ retraining

### Tasks

- [x] `FCAST-1201` สร้าง prediction settlement/metric aggregation job
- [x] `FCAST-1202` สร้าง operations + accuracy dashboard
- [x] `FCAST-1203` ตั้ง ingestion/inference/accuracy alerts
- [x] `FCAST-1204` เพิ่ม feature/prediction drift evaluator
- [x] `FCAST-1205` ทำ monthly candidate-training dry run
- [ ] `FCAST-1206` กำหนด monthly model/data review พร้อม owner
- [ ] `FCAST-1207` ซ้อม alert → disable ML → verify fallback
- [x] `FCAST-1208` กำหนด prediction/evaluation/artifact retention
- [ ] `FCAST-1209` วัด function memory, latency และต้นทุนต่อเดือน
- [x] `FCAST-1210` อัปเดต incident/retraining/rollback runbooks

### SLIs/SLO candidates

- Ingestion success rate
- Observation freshness
- Forecast availability
- API latency p50/p95/p99
- Inference failure rate
- Fallback rate/reasons
- Feature missingness
- MAE/RMSE/bias/category accuracy
- False-safe rate
- Interval coverage/width
- Distribution drift ต่อ feature/prediction
- Station coverage และ surface coverage

### Alerts

- [ ] Cron non-2xx
- [ ] ไม่มี fresh official station
- [ ] Forecast error/fallback spike
- [ ] Artifact checksum mismatch
- [ ] Model registry/artifact disagreement
- [ ] Accuracy แย่กว่า baseline
- [ ] Bias/false-safe เกิน threshold
- [ ] Feature drift/missingness spike
- [ ] Prediction out-of-range

### Retraining policy

- Scheduled candidate training รายเดือนเมื่อข้อมูลพอ
- Emergency retraining ไม่แทน rollback
- Retrain เมื่อ station/device/source/schema เปลี่ยน
- ทุก candidate ต้องผ่าน full gate, shadow และ approval ใหม่
- ห้าม overwrite version เดิม
- เก็บ retired artifact/metrics ตาม retention policy

### Exit criteria

- Dashboard และ alerts ทดสอบแล้ว
- มี monthly review owner
- มี incident/rollback/retraining runbook เชื่อมกัน

---

## Phase 13 — Community and field validation

เป้าหมาย: ตรวจพื้นที่ที่ official station เบาบางโดยไม่ลดมาตรฐานข้อมูลหลัก

### Rules

- Air4Thai ≤1 ชั่วโมง ภายใน 5 กม. เป็นข้อมูลหลัก
- Community เป็น supplementary
- เข้า IDW ได้เมื่อ approved/fresh/Trust ≥60 และ corroborated ≥2 คน
- หรือ Trust ≥80 พร้อม calibrated device
- GPS accuracy ≤200 เมตร
- ไม่อยู่ติด emission source
- ไม่ใช่ duplicate image
- Exact coordinates เป็น Admin-only

### Tasks

- [ ] `FCAST-1301` เลือก calibrated devices/reference checks
- [ ] `FCAST-1302` ทำ co-location calibration กับ official/reference monitor
- [ ] `FCAST-1303` เก็บ dry/wet season samples
- [ ] `FCAST-1304` ประเมิน district/sparse-area error
- [ ] `FCAST-1305` วัดผลเมื่อรวม community supplementary เทียบ official-only
- [x] `FCAST-1306` ห้ามเปิด community contribution ถ้า error/safety gate ไม่ผ่าน
- [ ] `FCAST-1307` ทำ privacy review ของ field workflow

### Exit criteria

- มี field evaluation report
- Community ไม่ทำให้ official-station validation แย่ลงเกิน policy
- ไม่มี exact-location exposure
- มี documented decision ว่าจะเปิด supplementary forecast surface หรือไม่

---

## Phase 14 — Security, privacy, legal และ communication

### Security

- [x] `FCAST-1401` Service-role/OpenAI/admin keys อยู่ server-only
- [x] `FCAST-1402` Artifact และ dataset manifests มี checksum
- [ ] `FCAST-1403` Production access ใช้ MFA และ least privilege
- [x] `FCAST-1404` Prediction logs ไม่มี precise community coordinates/images
- [x] `FCAST-1405` Dependency audits และ CI ผ่าน
- [ ] `FCAST-1406` Incident owner สามารถ disable ML/cron ได้

### Privacy

- [x] `FCAST-1410` ระบุว่า forecast ใช้ข้อมูลใดและ retention เท่าไร
- [x] `FCAST-1411` Analytics เก็บ aggregate เท่านั้น
- [x] `FCAST-1412` ไม่ใช้ private evidence เพื่อ train โดยไม่มี consent/legal basis
- [ ] `FCAST-1413` ตรวจ DPA/vendor inventory

### Health communication

- [x] `FCAST-1420` ข้อความไม่รับประกันผล
- [x] `FCAST-1421` แยก observation กับ forecast
- [x] `FCAST-1422` แสดง uncertainty/data freshness
- [ ] `FCAST-1423` อ้างอิงคำแนะนำสุขภาพจากแหล่งที่ได้รับอนุมัติ
- [x] `FCAST-1424` มีช่องทางแจ้งข้อมูลผิดพลาด

### Exit criteria

- Security/privacy/legal/product approvals ครบก่อน public launch

---

## 8. Risk register

| Risk                            | ผลกระทบ                    | Early signal                       | Mitigation/response                                       | Owner            |
| ------------------------------- | -------------------------- | ---------------------------------- | --------------------------------------------------------- | ---------------- |
| Air4Thai/cron ขาดช่วง           | Lag/target ใช้ไม่ได้       | freshness/completeness alert       | fallback, backfill แบบมี provenance, ห้ามสร้าง ML จาก gap | Data/Ops         |
| Weather/fire join leakage       | Offline metric สูงเกินจริง | point-in-time audit fail           | issued-at join, leakage tests, invalidate release         | Data/ML          |
| Zero-imputation ผิดความหมาย     | Bias วันที่ upstream ล่ม   | missingness vs error slice         | missing flags + explicit imputation policy                | ML               |
| โมเดลพลาดวันที่ฝุ่นสูง          | False-safe ต่อผู้ใช้       | threshold recall/bias alert        | rollback, raise interval/warning, retrain only after RCA  | Product/ML       |
| Artifact ถูกแก้/ไม่ตรง registry | Wrong model served         | checksum/status mismatch           | reject load, baseline fallback, incident alert            | Engineering/Ops  |
| Overfit บางสถานี/ฤดู            | ใช้ไม่ได้ทั้งจังหวัด       | station/season slice regression    | rolling/station holdout, more data, limit rollout         | ML               |
| Interval แคบเกินจริง            | ผู้ใช้เชื่อมั่นเกิน        | empirical coverage ต่ำ             | recalibrate, widen/withhold, UX warning                   | ML/Product       |
| Sparse station coverage         | แผนที่ทำให้เข้าใจผิด       | high nearest-distance/low coverage | coverage mask, no household-level claims                  | Product/GIS      |
| Community sensor bias           | Surface/validation ผิด     | co-location error                  | official-first, calibrated/corroborated policy            | Field/Data       |
| Production cost/latency สูง     | API ช้า/เกิน budget        | p95/memory/cost alert              | neutral artifacts, batch/cache, scope horizons            | Engineering/Ops  |
| Privacy leakage                 | ความเสียหายสูง             | exact coordinate/image in logs     | stop launch, incident response, log minimization          | Security/Privacy |
| Model drift                     | Accuracy ลดหลังเปิด        | feature/performance drift          | baseline fallback, review, gated retraining               | ML/Ops           |

### Release gates

| Gate                 | ต้องผ่านก่อน                      | ผู้อนุมัติขั้นต่ำ                    |
| -------------------- | --------------------------------- | ------------------------------------ |
| G0 Data collection   | เปิด cron สะสมข้อมูล              | Data + Operations                    |
| G1 Offline candidate | Register candidate                | Data/ML + Engineering                |
| G2 Shadow            | เริ่มบันทึก production prediction | Product + Data/ML + Operations       |
| G3 Canary            | แสดง ML ต่อผู้ใช้บางส่วน          | Product + Data/ML + Security/Privacy |
| G4 Full production   | เปิด 100%                         | Product + Operations + Data/ML       |
| G5 Mature claim      | อ้างว่า validate หลายฤดูกาล       | Product + Field + Legal/Privacy      |

---

## 9. Testing strategy

### Unit tests

- Feature calculation/timezone/missingness
- Haversine/spatial features/IDW surface
- Baselines
- Activation gates
- Artifact checksum/schema validation
- Uncertainty calibration
- Data-quality/fallback reasons
- AQI category mapping from centralized source

### Integration tests

- Supabase export pagination and point-in-time joins
- Train artifact parity with XGBoost output
- Registry candidate/promotion/rollback
- Prediction ledger settlement
- Weather/fire upstream unavailable behavior
- Cron idempotency

### E2E tests

- Baseline when ML disabled
- ML when active artifact/registry/gate valid
- Corrupt/missing artifact fallback
- Stale/insufficient input warning
- Station forecast mobile UI
- Forecast map horizon selection
- Offline/error states
- Admin model status and rollback state

### Verification commands

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:unit:coverage
npm run build
npm run test:e2e
.venv\Scripts\python -m ruff format --check backend api scripts
.venv\Scripts\python -m ruff check backend api scripts
.venv\Scripts\python -m pytest --cov=backend --cov-fail-under=75
.venv\Scripts\python -m pip check
.venv\Scripts\python -m pip_audit -r requirements.txt
```

---

## 10. Operational commands

### Export training data

```powershell
.venv\Scripts\python -m scripts.export_forecast_training `
  --since 2026-01-01T00:00:00Z `
  --output data/forecast_training.csv
```

### Train

```powershell
.venv\Scripts\python -m scripts.train_forecast `
  data/forecast_training.csv `
  --output backend/model_artifacts
```

### Registry dry run

```powershell
.venv\Scripts\python -m scripts.register_forecast_models `
  --directory backend/model_artifacts
```

### Register candidates

```powershell
.venv\Scripts\python -m scripts.register_forecast_models `
  --directory backend/model_artifacts `
  --apply
```

`--apply` ต้องไม่หมายถึง production activation

### Production preflight

```powershell
.venv\Scripts\python -m scripts.production_preflight `
  --env-file .env.local `
  --json `
  --strict-features
```

---

## 11. Suggested execution order

ลำดับนี้ใช้เป็น backlog สำหรับ session ถัดไป:

1. `FCAST-0001..0008` — ยืนยัน owner/scope/gates
2. `FCAST-0101..0116` — ทำ source-of-truth และ ingestion ให้เสถียร
3. `FCAST-0201..0212` — data-quality contract และ export manifest
4. `FCAST-0301..0307` — baseline suite
5. `FCAST-0401..0408` — feature v2 และ train/inference parity
6. `FCAST-0501..0510` — rolling backtest/model card
7. `FCAST-0601..0607` — uncertainty calibration
8. `FCAST-0701..0712` — artifact/registry activation safety
9. `FCAST-0801..0812` — inference/API/surface forecast
10. `FCAST-0901..0910` — mobile UX/accessibility
11. `FCAST-1001..1008` — shadow 14–30 วัน
12. `FCAST-1101..1105` — canary/rollback
13. `FCAST-1201..1210` — monitoring/retraining operations
14. `FCAST-1301..1307` — field/community validation
15. `FCAST-1401..1424` — security/privacy/legal/product sign-off

งาน Phase 2–9 สามารถพัฒนาบางส่วนระหว่างรอข้อมูลสะสมได้ แต่ห้ามข้าม shadow/live evidence gate

---

## 12. Milestones และเวลาโดยประมาณ

เวลาเป็นประมาณการและขึ้นกับ owner/access/data availability:

| Milestone | เนื้อหา                                         |                  ระยะโดยประมาณ | Dependency                  |
| --------- | ----------------------------------------------- | -----------------------------: | --------------------------- |
| M0        | Owner/scope/release safety                      |                        1–2 วัน | ผู้รับผิดชอบ                |
| M1        | Supabase/cron/data-quality foundation           |                    1–2 สัปดาห์ | Accounts/keys/plan          |
| M2        | Baseline + dataset/feature v2                   |                    2–4 สัปดาห์ | M1                          |
| M3        | Rolling backtest + registry/inference hardening |                    3–6 สัปดาห์ | Data พร้อมบางส่วน           |
| M4        | Minimum data gate                               |              อย่างน้อย 6 เดือน | Cron ต่อเนื่อง              |
| M5        | Recommended multi-season data                   |                      12+ เดือน | Field operations            |
| M6        | Shadow                                          |                      14–30 วัน | Candidate ผ่าน offline gate |
| M7        | Canary                                          |                    2–4 สัปดาห์ | Shadow approval             |
| M8        | Multi-season production completion              | หลัง dry/wet season validation | Field report                |

Baseline สามารถใช้ระหว่างสะสมข้อมูลได้ แต่ต้องแสดง method/data quality/uncertainty ตามจริง

---

## 13. Definition of Done

ระบบพยากรณ์ถือว่า “ใช้งานได้จริง” เมื่อครบทุกข้อ:

- [ ] Supabase/cron/source data ผ่าน operational SLO
- [ ] มีข้อมูลอย่างน้อย 6 เดือนและผ่าน hard gate; public claim ระดับ mature ต้องมี multi-season evidence
- [ ] Dataset/feature contracts versioned และไม่มี leakage
- [ ] Baseline suite reproducible
- [ ] ML ผ่าน rolling backtest และ untouched holdout ทุก horizon ที่เปิด
- [ ] False-safe/season/station/district slices ผ่าน policy
- [ ] Uncertainty interval calibrated
- [ ] Artifact checksum/registry/active status ถูกตรวจที่ inference
- [ ] API fallback และ data-quality warnings ผ่าน tests
- [ ] Forecast surface ใช้ IDW haversine และมี sparse-area warning
- [ ] Mobile UX แสดง uncertainty/freshness/method อย่างชัดเจน
- [ ] Shadow 14–30 วันผ่าน
- [ ] Canary และ rollback drill ผ่าน
- [ ] Monitoring/drift/accuracy alerts ใช้งานจริง
- [ ] Field and multi-season validation มีรายงาน
- [ ] Security/privacy/legal/product approvals ครบ
- [ ] Runbooks, model card, release record และ owner list อัปเดต

---

## 14. เริ่มทำต่อครั้งถัดไป

ให้เริ่มจากสอง track พร้อมกัน:

### Track A — User/Infrastructure

1. แก้ Supabase `ConnectError`
2. ทำ staging schema และ preflight ให้ทุก table เป็น `true`
3. เปิด hourly sync และตรวจความต่อเนื่อง 14 วัน
4. ตั้ง weather/FIRMS credentials และ cron plan
5. ระบุ Product/Data/Operations owners

### Track B — Engineering

1. Implement `FCAST-0201..0212` data-quality contract
2. Implement `FCAST-0301..0307` baseline suite
3. Implement `FCAST-0401..0408` feature v2
4. Implement `FCAST-0501` rolling-origin backtest ก่อน train candidate ใหม่
5. เพิ่ม tests ทุก task และห้ามเปิด `ML_FORECAST_ENABLED`

คำสั่งเริ่ม session ถัดไปที่แนะนำ:

> ดำเนินการตาม `docs/superpowers/plans/2026-08-03-production-pm25-forecast-plan.md`
> เริ่ม Phase 2 data-quality contract ทีละ task ตั้งแต่ FCAST-0201 พร้อม tests
> โดยยังไม่เปิด ML และไม่เปลี่ยน production data
