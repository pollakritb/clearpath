# Production smoke and data freshness

Deployment verification and upstream data freshness have separate outcomes.
A successful deployment does not mean Air4Thai has published a new observation.

## ClearPath policy

| Setting                             | Value                        | Basis                                                                                   |
| ----------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| Primary Air4Thai sync               | Every 30 minutes, at :17/:47 | Project policy for an hourly source                                                     |
| Air4Thai instance cache             | 5 minutes                    | Shorter than the central sync interval; prevents repeated calls within a short interval |
| Backup skips after primary success  | 30 minutes                   | Matches the primary cadence                                                             |
| Smoke attempts                      | Up to 40                     | Agreed initial project setting                                                          |
| Delay between unsuccessful attempts | 15 seconds                   | Agreed initial project setting                                                          |
| Job timeout                         | 15 minutes                   | Hard limit; includes setup, requests and delays                                         |
| Polling deadline                    | 14 minutes                   | Leaves headroom for the job to report its result                                        |

These numeric values are project policy, not a published universal standard.
Measure actual release times and request latency before adjusting them.
Forty pauses alone are approximately ten minutes; request time is additional.
The polling deadline or job timeout may end execution before all forty attempts.

The smoke workflow checks out the triggering release and runs
`scripts/production_smoke.py` using Python's standard library. It only reads
`/api/health` and `/api/ready`. It does not call cron or require a cron secret.

Deployment passes only when the expected commit is live, health responds, the
database is readable, station data exists, and the freshness contract still uses
60/90-minute limits. Missing data, database failures, malformed responses,
unexpected status combinations and mismatched releases fail verification.

A 503 response is accepted as an independently reported data warning only when
the database is readable, station records exist, the contract is valid, there
are zero fresh stations and the reason is exactly `station_data_stale`.
The workflow summary explicitly reports `Deployment: verified` and
`Data freshness: stale`, and emits a GitHub warning. It never reports fresh
observations in that state. The public `/api/ready` response remains 503 and
existing Admin data-health monitoring continues to identify stale data.

## Interface

The status header reports fresh stations separately from the total and states
when no fresh stations exist. Nearby readings under two hours show their age
in minutes, avoiding an ambiguous rounded one-hour age just beyond the cutoff.
This does not change Place IDW eligibility or measurement timestamps.
The unsupported/non-standard `browsing-topics` directive is removed; camera,
geolocation and microphone policies remain explicitly configured.

## References

- [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/): separate symptoms from causes and make monitoring actionable.
- [GitHub workflow timeout](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes): a job's maximum runtime, not a recommended smoke duration.
- [MDN browsing-topics](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/browsing-topics): non-standard directive with limited availability.

## Source timestamps and interpretation

The configured endpoint is `services/getNewAQI_JSON.php`. The inspected payload
contains `AQILast.date`, `AQILast.time`, and `AQILast.PM25.value`; it contains no
explicit averaging-period or start/end-of-window metadata. The
[official Envilink catalogue](https://envilink.go.th/en/dataset/air-quality-pm2point5)
lists both daily and hourly data and an hourly update frequency. That catalogue
alone does not prove the averaging window of this specific field. Do not equate
hourly updates with a one-hour average, or describe the source timestamp as a
confirmed instantaneous measurement time. Public station cards therefore say
"เวลาข้อมูลต้นทาง"; community captures retain their capture-time wording.

The parser preserves the source date/time with the existing Thai +07:00 offset;
missing or malformed times become unknown instead of invented midnight values.
A source timestamp more than five minutes in the future is also unknown. The
existing five-minute clock-skew tolerance matches Place IDW. Valid source times
are never replaced by ingestion time. Freshness boundaries remain 60/90 minutes.

## Previous readings during a publication gap

When no current Place IDW value exists, the compact panel can show the newest
valid nearby station or approved community source as reference. The source name,
its own PM2.5 value, source timestamp, age and distance are shown with
"ข้อมูลก่อนหน้า ไม่ใช้คำนวณค่าปัจจุบัน". This is a single source reading, not a
new area estimate. It does not enter current contributors, eligibility, colour
classification or health advice. Missing, nonfinite, negative and future values
or times are omitted; reports with unresolved source selection are omitted.
The no-current-data message and historical/forecast navigation remain available.

User-facing headers avoid "ล่าช้า" and "หมดอายุ" as primary labels. They report
station totals and the number exceeding the current-data policy explicitly.
Station marker and cluster colours use only readings meeting the current
station policy; prior readings use neutral colours.
Internal delayed/expired states remain available to operations and algorithms.

## Follow-up observation before any threshold change

Observe 7–14 days as an initial project experiment, not an international rule.
Use existing sync-run and reading intake timestamps to distinguish scheduled
execution gaps from source-time-to-intake lag. Record distribution percentiles,
source/station coverage and periods without eligible data. Intake lag includes
polling delay and potentially the source's averaging-window semantics; it is
not a direct measurement of the source publication time. Verify averaging and
window-end semantics with authoritative API documentation before interpreting it.

Compare any proposed eligibility policy against current results, then document
its version and obtain approval before altering the 60/90-minute policy. This
release prepares truthful presentation and validation; it does not claim that
a multi-day experiment has already completed or that source publication gaps
have disappeared.
