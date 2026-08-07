# Forecast field validation protocol

This protocol prepares Phase 13; it does not replace real measurements,
participant consent, device calibration certificates or expert sign-off.

## 1. Approval and equipment

Before collection, obtain privacy/legal approval for the notice, consent,
precise-location handling, private photos, retention and deletion process.
Select calibrated devices with serial number, firmware, calibration date,
reference method, uncertainty and next due date recorded. Do not mark a device
`calibrated` from a self-declaration alone.

## 2. Co-location

Place each field device beside an approved reference or official monitor while
following the monitor operator’s siting rules. Record UTC timestamps, one-minute
raw samples, averaging method, temperature/humidity, device serial, operator and
site ID. Never publish precise field coordinates. Collect at least 24 continuous
hours and enough low/medium/high PM bands; repeat or reject a run with clock
drift, power interruption, direct source interference or missing calibration.

Calculate paired count, bias, MAE, RMSE, correlation, band-specific error and
false-safe category rate. Keep raw evidence private. Store only aggregate
calibration parameters and approval metadata in production.

Create a separate de-identified analytic CSV outside Git with exactly these
columns (use a study code, never the real device serial):

```text
device_code,timestamp_utc,device_pm25,reference_pm25,temperature_c,relative_humidity_percent
```

Keep the serial/operator/site/coordinates only in the access-controlled raw
manifest. Pre-register every threshold, then run:

```powershell
.venv\Scripts\python scripts\evaluate_device_colocation.py <PRIVATE.csv> `
  --output <AGGREGATE.json> `
  --minimum-duration-hours 24 `
  --minimum-pairs <APPROVED_MINIMUM> `
  --maximum-gap-minutes <APPROVED_GAP> `
  --minimum-rows-per-band <APPROVED_BAND_MINIMUM> `
  --maximum-absolute-bias <APPROVED_BIAS> `
  --maximum-mae <APPROVED_MAE> `
  --maximum-false-safe-rate <APPROVED_RATE>
```

The command fails closed on missing low/medium/high reference bands, duplicate
timestamps, a non-UTC-aware timestamp, environmental values outside physical
bounds, insufficient duration/pairs, long gaps or a policy regression. It emits
only aggregate per-study-code metrics and the input SHA-256; it does not make a
device certified and does not replace the calibration certificate or approver.

## 3. Seasonal and geographic sample plan

Create a matrix covering dry and wet season, every district, urban/rural areas,
official-station coverage and sparse areas. Pre-register target sample counts;
do not stop collection only when results look favorable. For each horizon
1/3/6/12/24 hours report MAE, RMSE, bias, category accuracy, false-safe rate and
interval coverage with sample count. Label cells with fewer than the approved
minimum as insufficient evidence.

## 4. Community contribution experiment

Run official-only and official-plus-community evaluation on the same immutable
time/location folds. Community may enter IDW only when approved, fresh, Trust
≥60 and corroborated by different users, or Trust ≥80 with a genuinely
calibrated device. Preserve gap-fill rules, stable public obfuscation and the
official-primary rule. Compare overall and sparse-area metrics. Do not enable
community contribution if false-safe rate, privacy review or safety gate
regresses.

### Aggregate comparison command

Keep the private source CSV outside Git. It must contain only these columns:

```text
observed_pm25,official_only_pm25,official_community_pm25,district,season,sparse_area,horizon_hours
```

Do not add user/report identifiers, images or coordinates. Run the same
pre-registered thresholds for every analysis:

```powershell
.venv\Scripts\python scripts\evaluate_field_forecast.py <PRIVATE.csv> `
  --output <AGGREGATE.json> `
  --minimum-slice-rows <APPROVED_MINIMUM> `
  --max-mae-regression-percent <APPROVED_PERCENT> `
  --max-false-safe-rate-delta <APPROVED_DELTA>
```

The command uses the production PM2.5 category function and emits overall,
district, dry/rainy, sparse/covered and 1/3/6/12/24-hour comparisons. It rejects
private columns before analysis, records the input SHA-256, and returns non-zero
when a required slice is missing/insufficient or violates the approved MAE or
false-safe policy. The aggregate output is analysis evidence, not approval.

## 5. Evidence package and stop rules

The signed package must include protocol version, participant consent ledger,
device certificates, immutable raw manifest/checksum, exclusions with reasons,
analysis code SHA, aggregate results, privacy review, deviations and named
approvers. Stop immediately for public precise coordinates/images, invalid
consent, calibration failure, timestamp mismatch, duplicate evidence bypass or
false-safe regression beyond the approved threshold. Disable the affected
feature and follow the incident runbook.
