# Daily nearest-pin LINE alerts

Policy `nearest-pin-daily-v2` fixes the search radius at 2 km and the two alert
bands at 37.6–75.0 and above 75.0 µg/m³ (displayed as 75.1+). Source values keep
their original precision. The closest fresh eligible pin is selected before
checking its concentration; this is not a maximum over all nearby pins or IDW.
Own community reports remain excluded.

Both band switches default on. Existing channel opt-outs are preserved.
Browser location permission supplies foreground GPS samples and activates the
legacy notification consent record automatically; there is no second consent
checkbox. Permission changes on entry are observed without prompting again. Users can toggle the channels/bands but cannot change
the radius, thresholds or global quiet hours. Legacy radius/threshold/time
fields are normalized by both the API and a database trigger.

Each band can send once per Asia/Bangkok calendar day. Warning can escalate to
danger that day; danger followed by warning does not send a downgrade. Missing
data, recovery, pin changes and relinking do not replenish a used quota. The
service-only `air_alert_daily_limits` ledger persists reservations across state
resets. Acknowledged delivery consumes the quota. An unattempted superseded
message releases its reservation; ambiguous provider attempts retain it.
Old-policy and previous-day queued messages are suppressed at delivery.

LINE messages include the value, health band, source/name/public pin identifier,
approximate GPS distance, observation time in Thailand, GPS reference time,
health advice, and a link to that pin. Community locations are public obfuscated
coordinates; their distance is explicitly approximate.

Local verification:

```sh
node scripts/test-daily-air-alerts.mjs
.venv/bin/python -m pytest backend/tests/test_nearest_air_alert.py backend/tests/test_line_delivery_allowlist.py
npx playwright test e2e/notification-alert-policy.spec.ts
```

The SQL rehearsal uses an isolated PGlite database and checks quotas, midnight,
escalation, relinking/state reset, stale revisions, delivery acknowledgment,
legacy alert backfill and service-only access. Browser tests never send LINE
messages. Apply only the fixed-daily-alert migration to the main project during
rollout; leave unrelated pending migrations untouched. Verify schema defaults,
ledger RLS/privileges, production health and deployed commit after rollout.

## Foreground location and retention

The map, Today and alert presence share one browser location watch. Coordinates
update in memory as the browser reports them. Alert presence saves only the
latest accurate (≤200 m) sample, at most once per 30 seconds during visible use.
It attempts a keepalive flush of the last received sample on page hide. Neither
GPS availability nor completion of an exit request is guaranteed by the browser.
Hidden pages stop the watch; returning restarts it. Manual map recentering uses a
fresh position and publishes it to the same subscribers. The UI offers status
only; no manual refresh/delete GPS tasks are required.

Alert locations stop being eligible after 24 hours. The independent database
job `clearpath-air-alert-location-retention` deletes expired rows hourly at
minute 23, normally removing them within about 25 hours of their observation.
It does not depend on LINE worker instances or browser activity. Turning off air
alerts and confirmed account closure retain their existing immediate deletion.
The migration also removes already expired alert locations once at rollout.
Other GPS-bearing report/helper records have their own retention policies.
