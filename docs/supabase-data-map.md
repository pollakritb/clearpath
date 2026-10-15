# ClearPath Supabase data map

Production project: `ClearPath` (`qnrtryspglioqhdxglzu`). This inventory was
checked on 2026-10-16 (Asia/Bangkok) against `public` tables, migrations,
backend reads/writes, and the active Supabase cron. Counts are a point-in-time
snapshot, not retention targets. The browser uses Supabase for Auth; application
data is served through the ClearPath `/api/*` backend with `service_role`.

## Observations and external sources

| Table                         |    Rows | Purpose                                                                                                                                                                      |
| ----------------------------- | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stations`                    |     177 | Air4Thai station identity, location, and latest headline PM2.5/AQI.                                                                                                          |
| `pm25_readings`               | 204,237 | Append-only Air4Thai PM2.5 history by station and source observation time. `source_at` is the source time; `ingested_at` is the ClearPath intake time.                       |
| `sync_runs`                   |   3,730 | Air4Thai ingestion run status, source freshness, counts, and errors.                                                                                                         |
| `weather_observations`        |     740 | Observed temperature, humidity, wind, and rain near stations. Not PM2.5.                                                                                                     |
| `fire_feature_snapshots`      |   1,186 | Satellite hotspot-derived features by station and time. Not confirmed fires.                                                                                                 |
| `weather_forecasts`           |       0 | Weather forecast features for the paused forecast pipeline. Not CAMS PM2.5.                                                                                                  |
| `forecast_provider_snapshots` |   8,496 | Raw external PM2.5 forecast evidence. At audit time all rows were `openmeteo_cams`; preserve `issued_at` (retrieval/issue field) separately from `forecast_at` (valid time). |
| `forecast_provider_sync_runs` |       7 | External-provider collection run status and errors.                                                                                                                          |

The Air4Thai primary cron is `clearpath-air4thai-sync-30m`, active at minutes
17 and 47 each hour. CAMS snapshots are collected by the separate scheduled
workflow; they are forecasts, never observations. Do not mix their PM2.5 values
with `pm25_readings` or present `issued_at` as a measurement time.

## Community reports and identity

| Table                | Rows | Purpose                                                                           |
| -------------------- | ---: | --------------------------------------------------------------------------------- |
| `profiles`           |    4 | App profile, role, and internal reputation summary; linked to Supabase Auth.      |
| `capture_sessions`   |   41 | Short-lived camera capture sessions and one-time consumption.                     |
| `community_reports`  |   10 | OCR-reviewed reports, PM2.5, private GPS, publication status, and audit metadata. |
| `report_evidence`    |   10 | Private photo/OCR evidence for reports.                                           |
| `report_drafts`      |    0 | In-progress report submission state.                                              |
| `report_reviews`     |    0 | Nearby-user gratitude/review history.                                             |
| `report_reactions`   |    2 | Likes/dislikes on reports.                                                        |
| `report_comments`    |    0 | Comments on reports.                                                              |
| `reputation_events`  |   10 | Internal trust/reputation ledger.                                                 |
| `rate_limit_windows` |   64 | Request throttling counters; operational, not user-facing history.                |

Do not expose the raw `community_reports` coordinates or `report_evidence`
paths directly. Public reports pass the backend privacy/presentation layer.

## News, notifications, and audit

| Table                      | Rows | Purpose                                                                             |
| -------------------------- | ---: | ----------------------------------------------------------------------------------- |
| `announcements`            |    0 | Admin-published ClearPath announcements; external RSS items are fetched separately. |
| `activities`               |    0 | Community activity/reward definitions.                                              |
| `public_map_events`        |    9 | Public map event entries.                                                           |
| `data_issue_reports`       |    0 | User-reported data issues.                                                          |
| `audit_logs`               |   10 | Administrative/system audit trail.                                                  |
| `notification_preferences` |    1 | Per-user alert conditions and area.                                                 |
| `push_subscriptions`       |    0 | Web Push device endpoints.                                                          |
| `line_notification_links`  |    2 | LINE notification connections.                                                      |
| `line_webhook_events`      |    2 | LINE webhook deduplication.                                                         |
| `alert_events`             |    0 | Detected alert events and delivery state.                                           |
| `user_notifications`       |   10 | User-facing notification records.                                                   |
| `notification_outbox`      |   10 | Pending/completed delivery work.                                                    |

## Paused forecast/model pipeline

| Table                                  |   Rows | Purpose                                                                        |
| -------------------------------------- | -----: | ------------------------------------------------------------------------------ |
| `forecast_consensus_latest`            |      0 | Old multi-provider consensus result.                                           |
| `forecast_prediction_sources`          |      0 | Inputs attributed to consensus predictions.                                    |
| `community_forecast_feature_snapshots` |      0 | Community-derived forecast features.                                           |
| `forecast_runs`                        |      0 | Generated ClearPath forecast runs.                                             |
| `forecast_predictions`                 |      0 | Generated predictions linked to runs.                                          |
| `forecast_evaluation_daily`            |      0 | Historical accuracy aggregates.                                                |
| `forecast_drift_snapshots`             |      0 | Model drift diagnostics.                                                       |
| `forecast_false_safe_reviews`          |      0 | Reviews of unsafe under-predictions.                                           |
| `forecast_data_quality_daily`          | 29,028 | Source-data completeness/quality evidence; **not** disposable forecast output. |
| `model_registry`                       |      0 | Model registration/audit state.                                                |
| `forecast_release_decisions`           |      0 | Model release decision audit trail.                                            |

Empty does not mean unused: the backend and migrations still reference several
of these tables. Remove a table only after retiring its code paths, checking
foreign keys/jobs, taking a restorable backup, and applying a new forward-only
migration. Never edit an already-applied migration or use `DROP ... CASCADE` as
a cleanup shortcut.

## Useful read-only queries

```sql
-- Current Air4Thai station headline and its source timestamp.
SELECT id, name_th, pm25, aqi, recorded_at
FROM public.stations
ORDER BY name_th;

-- One station's Air4Thai history (station ID is an input, not a literal).
SELECT recorded_at, pm25, aqi, source_at, ingested_at, source_status
FROM public.pm25_readings
WHERE station_id = '103t'
ORDER BY recorded_at DESC
LIMIT 48;

-- CAMS evidence. forecast_at is the valid time, not the fetch time.
SELECT station_id, provider, issued_at, forecast_at, horizon_hours,
       pm25, unit, raw_metadata
FROM public.forecast_provider_snapshots
WHERE station_id = '103t' AND provider = 'openmeteo_cams'
ORDER BY issued_at DESC, forecast_at
LIMIT 48;

-- Data-source health without exposing user information.
SELECT source, status, started_at, completed_at, station_count,
       reading_count, error_message
FROM public.sync_runs
ORDER BY started_at DESC
LIMIT 20;
```

The 2026-10-16 permission migration enables RLS and removes direct
`anon`/`authenticated` table privileges for the ten previously unrestricted
source/operational tables. Service-role access remains for `/api/*` and jobs.
On 2026-10-16, a read-only `pg_class`/`has_table_privilege` check in the
ClearPath Production SQL Editor confirmed this state for all ten tables; the
migration does not need to be rerun as part of the Vercel code deployment.

The CAMS snapshot table occupied about 148 MB at the start of this audit, of
which about 145 MB was indexes after prior forecast resets. Four indexes were
rebuilt concurrently on 2026-10-16; the table then occupied about 4.5 MB,
with all 8,496 evidence rows and all indexes valid. No CAMS rows were deleted.
