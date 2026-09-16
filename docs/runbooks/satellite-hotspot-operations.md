# Satellite hotspot operations

ClearPath treats NASA FIRMS observations as **satellite hotspots**, not as
confirmed fires. This runbook defines the production contract shared by the
map, alerts, forecast features, and operational checks.

## Public data policy

- Fetch `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, and `VIIRS_NOAA21_NRT` for the
  Thailand bounding box. The server key never reaches the browser.
- Parse the FIRMS acquisition date/time as UTC. Reject invalid coordinates,
  invalid timestamps, and future observations.
- Merge observations no more than 1 km and 30 minutes apart. Retain the
  strongest FRP/brightness observation and list every contributing product.
- Publish only observations inside the checked-in Nakhon Pathom polygon and
  no older than 12 hours, inclusive at the 12-hour boundary.
- Use a satellite-shaped orange marker. PM2.5's five-level colors are reserved
  for markers that represent measured or estimated PM2.5.
- Public copy must say `จุดความร้อนจากดาวเทียม` and must also state that the
  observation is not a confirmed fire.

## API states

`GET /api/firms?days=1` returns one of these explicit states:

| State                 | Meaning                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `available`           | At least one in-area observation is no older than 12 hours       |
| `checked_no_hotspots` | The upstream check succeeded and no in-area observation was seen |
| `stale`               | In-area observations exist, but all are older than 12 hours      |
| `unavailable`         | FIRMS was configured but all supported upstream products failed  |
| `unconfigured`        | `FIRMS_MAP_KEY` is absent                                        |

Only `checked_no_hotspots` means the check completed without finding a fresh
hotspot. The other empty states must never be presented as “ไม่พบจุดความร้อน”.
`checked_at` records when ClearPath evaluated the response;
`latest_acquired_at` records the latest in-area observation when one exists.

## Alert policy

- The alert cron applies the same polygon, 12-hour limit, future guard, and
  cross-product deduplication as the public API.
- A recipient must have hotspot alerts enabled and the point must fall inside
  the user's configured center/radius. A missing center means nationwide.
- The stable hotspot identifier is the alert deduplication key. Creating an
  alert event is idempotent, recipients are deduplicated, and creation writes
  an `alert_event_created` audit record.
- Quiet hours defer the per-channel outbox item without consuming a retry.
  Web Push and LINE retry independently.
- A FIRMS failure does not suppress independent Air4Thai PM2.5 alerts.

## Repeatable verification

```powershell
.venv\Scripts\python -m pytest backend/tests/test_hotspot_policy.py backend/tests/test_firms_service.py backend/tests/test_environment_fallbacks.py backend/tests/test_alerts_service.py backend/tests/test_notifications_service.py
npx playwright test e2e/mobile-pages.spec.ts --grep "satellite hotspot fixture"
```

The fixture proves the positive API/map/notification/audit path without
fabricating a live satellite observation. Record a live positive-event drill
only when NASA FIRMS actually reports a qualifying Nakhon Pathom observation;
an empty but successful live check is not evidence for that gate.

## Incident checks

1. Read `/api/firms?days=1` and record `status`, `checked_at`,
   `latest_acquired_at`, `count`, and the deployed release SHA.
2. If `unconfigured`, verify only the server-side `FIRMS_MAP_KEY` in Vercel.
3. If `unavailable`, inspect runtime logs and retry after the upstream window;
   do not replace the state with a false-clear response.
4. If `stale`, keep the layer empty and display its age. Do not extend the
   12-hour public threshold to make data appear current.
5. For suspected duplicate alerts, compare hotspot IDs, acquisition times,
   coordinates, `source_products`, `alert_events`, outbox rows, and audit logs.
