# Nearby-pin air alerts

Policy `nearby-pin-observation-v3` evaluates every fresh eligible pin within
2 km of the saved foreground GPS, then applies the enabled alert bands:
37.6–75.0 and above 75.0 µg/m³ (displayed as 75.1+). A nearby low reading never
masks a farther warning. This is direct observation alerting, independent of IDW.
Stations must be at most 1 hour old; approved community reports at most 3 hours.
Own community reports are excluded and public obfuscated coordinates are used.

There is no per-day count, per-band quota, cooldown or one-pending-message slot.
Every qualifying observation can create its own inbox item and LINE outbox job.
A stable recipient-scoped key identifies source type, source ID, normalized
observation time and measured value. Repeated cron evaluations, GPS refreshes,
state resets and concurrent retries cannot create duplicates. A new reading or
corrected value can notify again, including a lower enabled band after danger.
Midnight alone never resends an unchanged reading.

Both band switches default on; existing consent/channel/band opt-outs remain.
Invalid GPS, observations older than their source TTL, unapproved/own reports and
pins outside 2 km are ineligible. The delivery worker rechecks the specific
observation against current GPS/preferences and source data; it does not require
that observation to be the nearest pin. Replaced, stale or opted-out observations
are suppressed before external delivery. Provider rate/monthly budgets, channel
availability and delivery cutoffs are separate operational controls and remain.

`commit_nearby_air_alerts` atomically validates GPS/preference versions, rechecks
the current source candidates, and inserts the entire batch. Existing unique
notification/outbox keys prevent duplicates across retries and workers; inbox
retention exceeds the maximum eligible source age. No public grants or new RLS
bypass are introduced. Notification counts report newly queued observations.

The historical daily ledger and legacy policy tests remain as audit evidence.
The new delivery trigger ignores the retired daily ledger for v3 notices. Old
writers cannot enqueue the retired policy, and old-policy pending jobs fail the
new worker eligibility check. No old jobs are replayed or bulk sent by migration.

LINE text and settings explain every qualifying nearby pin, unlimited daily
frequency and observation deduplication. Each message includes the measured
value, band, source/name/pin, approximate GPS distance, observation/GPS times in
Thailand, advice and a deep link. GPS consent/retention behavior is unchanged.

Local verification (no real LINE messages):

```sh
node scripts/test-nearby-air-alerts.mjs
.venv/bin/python -m pytest backend/tests/test_nearby_air_alert.py backend/tests/test_nearest_air_alert.py backend/tests/test_line_delivery_allowlist.py
npx playwright test e2e/notification-alert-policy.spec.ts
```

Rollout requires migration `20261127105812_nearby_air_alerts.sql` followed by the
matching backend/frontend release. Apply only this migration on the main project;
preserve unrelated migrations, presentation settings, consent and worker flags.
The migration retires old enqueueing, so deploy the matching code immediately
after it. Verify RPC permissions, health and release SHA before enabling delivery.
A rollback requires restoring the previous functions together with the previous
application release; rolling back code alone leaves old enqueueing disabled.

## Foreground location and retention

The map, Today and alert presence share one browser location watch. Coordinates
update in memory as the browser reports them. Alert presence saves only the
latest accurate (≤200 m) sample, at most once per 30 seconds during visible use.
It attempts a keepalive flush of the last received sample on page hide. Neither
GPS availability nor completion of an exit request is guaranteed by the browser.
Hidden pages stop the watch; returning restarts it. Manual map recentering uses a
fresh position and publishes it to the same subscribers. The UI offers status
only; no manual refresh/delete GPS tasks are required.

Alert locations stop being eligible after 24 hours. Production migration
`20261116083327_foreground_alert_gps_retention.sql` installs the independent
hourly cleanup at minute 23 and deletes saved alert GPS immediately when consent
or air alerts are disabled. A READ ONLY catalog recheck on 17 November 2026
confirmed this job is active. The redundant local-only hourly migration was
archived instead of applied again. Worker retention and account closure remain
independent of this schedule.
Other GPS-bearing report/helper records have their own retention policies.
