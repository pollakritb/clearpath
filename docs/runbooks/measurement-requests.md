# Community measurement requests

Request fresh PM2.5 around a searched destination: 1/3/5 km (default 3), now for
one hour or needed-by within 24 hours. Scheduled windows open 30 minutes before
the deadline. One newly approved report by a different person, measured and
submitted inside the window and radius, fulfils the request. Existing matching
reports submitted during the window also qualify without opening an invitation.

Recipients opt in separately from other alerts. Only their most recent website
GPS (accuracy <=200 m) is retained. No age expiry, travel history or background
tracking: the invitation explicitly says the last-visit location may be old.
Opt-out clears matching coordinates. No public helper list or coordinates.
Every eligible helper is eventually invited, once per request. Work uses 100-helper
pages and fair 50-request batches with a 20-second processing budget, rather than
capping total recipient count. No automatic radius expansion. Large backlogs
may delay delivery; observe throughput and scale the worker before increasing load.

## Local

1. Run FastAPI :8000 and Next :3000 with `LOCAL_DEMO_MODE=true` and
   `NEXT_PUBLIC_LOCAL_DEMO_MODE=true`. Production feature flag remains false.
2. Run `.venv/bin/python -m scripts.measurement_worker`. It calls the local
   protected cron every 30 seconds, operating in the API's demo memory store.
3. Search a place on the map, select "ขอให้ช่วยวัดบริเวณนี้", or open `/requests`.
   Helper opt-in is at `/settings/notifications`; report context uses
   `/report?request=<uuid>`. Single-user demo excludes self; tests supply distinct
   users. Demo records reset on backend reload.
4. Run `pytest backend/tests/test_measurement_requests.py`, the frontend
   measurement tests and `scripts/check_measurement_migration.mjs` using the
   isolated PGlite module documented at the top of that script.

## Staging, then production (separate release instruction)

1. Apply `supabase/migrations/20261029004117_measurement_requests.sql`. This creates
   private RLS tables and service-role-only invoker RPCs, without deleting old data.
2. Deploy API/UI, set `MEASUREMENT_REQUESTS_ENABLED=true`, keep real LINE delivery
   off on staging unless test recipients explicitly consent. Existing notification
   consent, linked LINE and quiet hours still apply. Local demo never belongs in production.
3. Check the target environment's existing Vault secrets, then execute
   `scripts/sql/measurement_request_scheduler.sql`. It invokes the authenticated
   `/api/cron/measurement-requests` every minute. Do not configure a free Vercel
   Hobby minute cron or rely on browser timers for lifecycle progression.
4. Confirm no anonymous/authenticated role has direct table/RPC access and run
   Supabase advisors. Validate the full two-user scenario, cancellation, expiration,
   retries and opt-out before enabling for a wider audience.

## Delivery and recovery

- Inbox + outbox insert atomically with stable dedup keys; first concurrent report
  wins an atomic terminal update. Notifications queued before closure are updated.
- Workers reconcile approved reports before expiring a request, recovering failed
  post-submit processing. They retry terminal owner notices for 48 hours.
- Request LINE deliveries recheck status, deadline, helper consent and decline
  immediately before send; closed/expired/opted-out jobs become dead. Owner result
  notices expire after one day. Quiet hours defer delivery; expired requests are
  never sent after the quiet window.
- Per-event delivery leases avoid concurrent workers; stable `X-Line-Retry-Key`
  prevents duplicate accepted LINE pushes after network retries. A zero delivery
  does not mean the user read the message. LINE quota failures follow existing
  bounded retry policy and never remove the inbox item.
- Observe `measurement_requests_processed` (processed/fulfilled/expired/failed),
  cron HTTP failures, outbox failures/backlog and age of unprocessed requests.
  Disable the feature flag and unschedule the named cron for rollback; keep rows
  for diagnosis. Do not purge report evidence or notification history as rollback.

## API

Authenticated `/api/measurement-requests`: POST create (UUID idempotency key),
GET own/invited list, GET `/{id}` detail, POST `/{id}/cancel` (owner only), POST
`/{id}/decline` (recipient only). GET/PUT `/helper` returns consent and last sample
age only; PUT `/presence` accepts a fresh GPS reading, throttled to five minutes.
Creation limits are 3/day in Asia/Bangkok, 2 active requests; duplicate immediate
requests for the same coordinates/radius return the existing row. No quota is
consumed by retrying the same idempotency key.

`ReportDraftSubmit.measurement_request_id` is optional private audit context.
It does not bypass OCR, GPS, duplicate or publication checks and does not change
Trust/IDW admission. Public results use the existing obfuscated report coordinates
and signed image policy; rounded distance is computed from those public coordinates.
