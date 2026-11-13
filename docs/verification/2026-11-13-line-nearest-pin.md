# LINE nearest-pin implementation — local verification

Date: 2026-11-13. Scope: local implementation and isolated tests; no commit/push/deployment, hosted migration, external LINE messages or production load test.

## Implemented

- Authenticated latest-GPS API, timestamps/accuracy validation, monotonic location CAS, private owner status and deletion/export lifecycle.
- Foreground GPS synchronization across app routes with existing permission only, account-scope callback cancellation and throttling. Explicit mobile controls handle missing/stale GPS, coarse accuracy, denied permission, failed saves, retry and clearing.
- Pure nearest-pin/episode policy plus bounded spatial PostgreSQL candidate query over both Air4Thai and approved community pins. Public community coordinates only; nearest selection precedes threshold comparison. No IDW/Trust/XP changes.
- Atomic episode/in-app notification/outbox commit and fenced completion. One pending air alert per user; superseded work can trigger fresh evaluation without silently blocking later alerts. Source/GPS/preferences are rechecked before sending.
- PostgreSQL durable inbox/outbox with atomic claims, lease recovery, stale-worker fencing, immutable provider requests and stable retry keys. Atomic single-use LINE linking and timestamp-ordered unfollow handling preserve legacy webhook deduplication.
- Shared provider request/monthly reservations, classified errors, jitter/backoff, quiet hours, retry-window cutoff and terminal outcomes. Missing configured monthly cap fails closed in durable mode.
- Separate worker roles (`inbox`, `evaluation`, `outbox`), shadow/canary controls, full queue aggregate metrics, bounded evaluation scheduling, hot-data pruning and operational runbook.
- Mobile settings explain both source types and GPS behavior. LINE connect/disconnect refreshes saved preference state without adding navigation destinations.

## Checks

| Check                               | Result                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Backend full suite                  | 703 passed; one existing Starlette/httpx deprecation warning                    |
| Frontend full unit suite            | 485 passed across 104 files                                                     |
| Mobile E2E regression subset        | 12 passed across 320/360/390/430px projects                                     |
| Additional browser interaction      | GPS update, delete, mocked save failure and close-to-origin verified            |
| Browser responsive inspection       | 320/375/390/430px: no horizontal overflow; GPS button height approximately 45px |
| SQL integration                     | Passed against isolated PGlite after the actual numeric-ID cutover              |
| Formatting/lint/type checking/build | Passed                                                                          |

SQL integration checks cover location write ordering, atomic notice/outbox state, source ranking/public-coordinate isolation, rejection fallback, CAS deduplication, outbox claims/lease recovery/fencing, durable webhook duplicate acceptance, single-use linking replay, out-of-order unfollow protection, shared budgets, evaluation leases and anonymous permission rejection.

`output/playwright/line-notifications-390.png` is a local screenshot of the explicit failed-save state. Its intentionally injected HTTP 503 explains the browser console error recorded in that manual scenario. Tests never exercise real LINE delivery.

Impeccable detector reported existing thick-border patterns elsewhere in the shared stylesheet; none were introduced in the new GPS section. Those unrelated designs were preserved.

## Activation and capacity boundaries

Use [the runbook](../runbooks/line-nearest-pin.md) for migration, environment flags, worker roles, canary and rollback. Durable sending remains disabled by default. The hosted database has not been migrated, the hosted worker has not been provisioned and actual LINE quota/Console settings have not been inspected.

The implementation uses the existing PostgreSQL outbox rather than introducing Redis/Kafka or requiring PGMQ. Identical-payload Multicast optimization and object-store/warehouse archival remain explicit later work; terminal history is retained in PostgreSQL without destructive archival pruning. Million-user throughput, deployed webhook p99 under 2 seconds, target-environment advisors/RLS and representative EXPLAIN/load/fault tests remain release gates, not claims supported by these local tests.
