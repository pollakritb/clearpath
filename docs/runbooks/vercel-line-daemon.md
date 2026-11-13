# Vercel LINE daemon trial

The existing Python worker can run on Vercel Daemons without moving the web application or PostgreSQL database. This is a controlled hosting trial, not a LINE delivery cutover.

## Configuration

- Source/build context: `backend/`; Dockerfile: `Dockerfile.line-worker`.
- Linux amd64 / Python 3.12; dependencies mirror canonical `requirements.txt` and are checked by a test.
- Runs as an unprivileged container user. Only the backend build context is copied; local `.env` files and test fixtures are excluded.
- Default command: `python -m backend.workers.line --probe --health-port 8080`.
- Probe reads queue aggregate metrics and, when a LINE token is configured, the official quota/consumption GET endpoints. It never claims jobs, applies retention, evaluates user state or sends LINE messages.
- `scripts.line_worker` remains a compatibility entrypoint. Existing `--role inbox/evaluation/outbox` commands are unchanged.
- Liveness requires a successful database check within 180 seconds and becomes unhealthy during shutdown. Health responses contain no credentials or recipient data.
- `vercel.json` starts with `sin1: 0`, 1 GiB memory. Scaling to one instance is a deliberate temporary test; scale back to zero afterward.

## Hobby limitation

The current production deployment is on Hobby. Published Vercel beta quotas are 420 GB-hours of provisioned memory and 5 active CPU-hours per month, shared across the team's daemons. Memory is charged against that quota while an instance waits too. One 1-GiB instance running 24 hours per day would require roughly 720–744 GB-hours in a 30–31 day month; even the minimum instance cannot run continuously for the whole month within that quota.

Do not enable production durable webhook/LINE delivery on the assumption that an unpaid Hobby daemon will run all month. A plan/hosting decision is still needed for uninterrupted service. The trial does not upgrade the plan or authorize paid overages.

## Trial acceptance

1. Verify Vercel accepts/builds the Dockerfile without changing web/API routing.
2. Deploy with zero instances and probe-only command; web smoke must still pass.
3. Temporarily scale to one instance. Inspect instance readiness and logs for `line_worker_probe`, successful database reads, and optional LINE quota GET results.
4. Confirm health probes and graceful stop; scale back to zero and verify no active instances remain.
5. Keep `LINE_DURABLE_DELIVERY_ENABLED` unchanged. Enable actual queue consumers only after the LINE quota and continuous hosting decision are settled, with the existing canary/cutover runbook.

References: [Vercel Daemons](https://vercel.com/docs/daemons), [configuration](https://vercel.com/docs/daemons/config-reference), [Hobby quotas](https://vercel.com/docs/daemons/limits).

## Bounded November 2026 trial

The user authorized operation through November 20 (Bangkok). Set
`LINE_DELIVERY_UNTIL=2026-11-20T17:00:00Z` (exclusive), one `sin1` instance at
1 GiB, and a positive `LINE_MONTHLY_MESSAGE_CAP` no larger than the provider's
remaining included messages at activation. Do not upgrade the Hobby plan.

Before activation, call `/api/cron/line-delivery-status` with the existing
server cron bearer token. This read-only endpoint returns aggregate queue
readiness and whitelisted LINE quota/consumption fields, never recipient IDs or
credentials. Anonymous calls must return 401.

The shared provider adapter blocks all sends at the cutoff, including cron and
already-reserved requests; the worker stops claiming jobs. A GitHub scheduled
workflow repeats the idempotent scale-to-zero request on November 20–21 using
the project deployment token stored as `VERCEL_LINE_WORKER_TOKEN`. Scheduled
GitHub runs can be delayed: the application cutoff does not depend on them.
The checked-in instance default stays zero so deployments cannot accidentally
restart the trial after its end. Scaling overrides persist across deployments.

At activation, verify provider HTTP 200, remaining quota, durable queue health,
and an alive daemon instance. Record the effective cap and release in the
private deployment evidence. No diagnostic endpoint sends a test message.

Activation quota check on November 13: provider limit 300, consumed 17, remaining
283. Trial cap: 280 additional push reservations at 1 request/second. Reservations
count attempts conservatively; retries may therefore use this budget before the
provider reports 280 delivered messages. Reply messages have their own rate
bucket and do not consume the monthly push reservation bucket.
