# Database readiness — local implementation and release gates

## Current authorization

The initial implementation was restricted to local changes and read-only production
inspection. The owner subsequently authorized **commit, push and application deploy**.
This release keeps `CAMS_GRID_FORECAST_ENABLED=false` (the default) and does not
apply hosted migrations, activate grid-only reads, retire tables, change hosted
cron/Vault, restore data or purchase services. Database cutover remains gated by
the recovery and observation evidence below; application deployment alone does
not establish database readiness.

## Evidence and current state

Baseline captured on November 14, 2026 Bangkok time (November 13 UTC):

- Database approximately 227 MB, including application/managed database objects;
  this is **not** disk usage including WAL/system files or Free quota headroom.
- Station CAMS snapshot relation approximately 121 MB; all identifier aliases
  approximately 68 MB. Alias storage is not exclusively CAMS.
- 63 public tables, 4 application-private tables and 10 Trust-private tables.
  All 63 public tables have RLS; all catalog constraints are validated.
- Storage metadata reports 34 objects, approximately 10 MB. No images were copied
  or deleted by the audit; object bytes and restore have not been verified.
- Seven scheduled jobs are registered. Registration is not proof that each worker
  ran successfully or that its configured cutoff is still active.
- Existing indexes are chosen for grid scalar reads, map history and preferences
  in bounded `EXPLAIN` plans. No new production indexes were justified or created.
- Migration history differs from repository filenames after the fresh-project
  bootstrap. Production-only `20261110002811` is named `air4thai_continuity_5m`;
  reconcile its command/history without replaying old scheduled jobs. The existing
  publish/retention function bodies match the baseline used for the new local migration.
  **Do not run blanket `db push`, mark old migrations applied, or rebuild production.**

Private evidence lives outside Git under:
`~/Library/Application Support/ClearPath/Backups/readiness-20261113T192754Z/`.
The manifest says `metadata-only-not-backup`. Catalog audit does not replace an
Auth-aware, consistent database + Storage backup. No production readiness or
million-user capacity claim follows from these observations.

Re-run using bounded read-only commands:

```sh
.venv/bin/python -m scripts.audit_database_readiness
.venv/bin/python -m scripts.profile_database_reads
```

The auditor has a fixed project target, READ ONLY transactions, statement budgets,
private output permissions and no row/query-text/cron-command export. Profiling
uses EXPLAIN without ANALYZE. Keep raw catalog/policy evidence private. The sanitized
[table inventory](database-inventory.md) lists every application table and column.

## Locally implemented changes

### CAMS grid reader

`CAMS_GRID_FORECAST_ENABLED=false` is the additive rollout default. With it enabled:

1. Station lookup supplies its coordinates; area lookup uses requested coordinates
   directly, without finding a nearby station or reading station snapshots.
2. The backend pins one ready grid generation and selects nearest native row/column.
   Midpoint ties go to the higher index, matching the browser. No spatial blend,
   zero fill or substitution of an adjacent missing cell is performed.
3. Service-only `read_cams_grid_point` returns a scalar series, at most 120 hours,
   using the existing generation/time key. It checks bounds, freshness and time range.
4. Responses retain the existing forecast contract and add generation, grid version,
   nearest sampling, stale state and expiry. An explicit missing generation returns 410. The browser refreshes metadata and retries once, without caching the new
   response under the old pinned generation.
5. At <=18h the generation is normal, >18h is stale, and >=36h is unavailable.
   Invalid/future retrieval timestamps fail closed. Missing hourly data terminates
   the contiguous forecast; shorter horizons remain explicit.
6. Browser display timers and tab-cache checks enforce expiry, including offline
   sessions. Forecast HTTP endpoints use no-store to prevent CDN copies outliving
   a deadline. Grid cache remains generation-scoped and bounded.
7. Snapshot cron returns retired; validation reads the pinned grid and provider
   health reads grid metadata. Existing snapshot code stays for rollback until the
   destructive retirement gate passes.

The new migration adds the reader and changes grid retention only. It does not
backfill, duplicate data, delete CAMS station tables or activate ingestion.
Publishing no longer bulk-cleans generations. Bounded retention keeps 72h plus
active/latest-two-ready protection, skips leased jobs and removes at most one
expired generation per invocation. The existing telemetry cap of 1,000 rows is
preserved while the old snapshot writer may still be active: reducing it to 500
would risk incoming rows exceeding cleanup throughput. New retirement cleanup
starts at 500 only after the old writer is stopped. Other retention policy is unchanged.

The GitHub workflow supports `CLEARPATH_CAMS_GRID_READS_ENABLED=true` to skip
station collection, and omits the station delay when the station job was skipped.
These are local file changes only; no repository variables were changed. Preserve
all existing authorized worker trial deadlines and provider send cutoffs.

### Pagination

- Map history now uses `(captured_at,id)` keysets with a fixed historical upper
  boundary, not mutable offsets. IDs in raw filter syntax are resolved numerically.
- Notification preferences use ordered user-ID keysets. The legacy broadcast
  interface still returns a list; converting it into a durable, checkpointed
  fan-out worker remains a separate, measured scalability task.
- Audit API accepts a bounded opaque cursor tied to action/entity filters, uses
  `(created_at,id)` and reads one lookahead row. Admin uses next_cursor; offset
  remains for old clients. CSV export reads bounded keyset pages rather than
  relying on a single request beyond PostgREST row limits. Cursors are **not credentials**; existing Admin checks
  remain mandatory. The dashboard remains read-only.

Do not add indexes solely because a query has changed. Obtain query plans and
representative workload measurements first; an empty/tiny table's sequential
scan is not automatically a missing-index defect.

## Data lifecycle and access matrix

| Data                                | Required behavior                                                         | Retention / forbidden shortcuts                                             |
| ----------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Auth/profile/closure jobs           | Owner-confirmed closure; block stale writes; durable Auth/Storage retries | Preserve erasure evidence; never recreate erased identities through restore |
| Public reports/social               | Existing automatic OCR publication and privacy rules                      | No blanket 72h report/comment deletion                                      |
| Exact evidence/GPS/media            | Admin-only exact data; private images and short signed URLs               | Existing audit holds/expiry; verify deletion before purge marker            |
| Trust private ledger                | Existing community-trust-v1 transactions and replay                       | 365d policy; preserve pending review and scoring/idempotency invariants     |
| XP/contribution-v3                  | Keep historic settlement and new contribution semantics                   | Never prune ledger solely because UI changed or rows look old               |
| Measurement/notification queues     | Claim/lease/fencing/retry/idempotency                                     | Keep unfinished jobs and dedup through supported retry window               |
| LINE inbox/locations/budgets        | Existing ordering, consent, quiet hours, quotas and trial cutoff          | Locations 24h; terminal inbox 30d; preserve active retries/budgets          |
| Official readings/sync/rate windows | Existing primary/backup ingestion and bounded cleanup                     | Existing 72h policy; no CAMS changes to Air4Thai                            |
| External news/FIRMS                 | Keep source-specific freshness and attribution                            | Existing feed policy; public satellite hotspot layer stays independent      |
| Audit/legacy evidence               | Keep references and historical explanation                                | No new destructive TTL without an existing approved policy                  |

Authorization boundaries:

- Anonymous/other users: published, privacy-filtered data only.
- Owners: only their existing permitted account actions; closure cannot target another user.
- Admin/Moderator: read-only dashboard, never arbitrary write access.
- Workers: protected server credentials and project guards; service-role reads
  still need application ownership/visibility checks.
- Private schemas: unexposed; no browser grants. RLS/catalog grants alone do not
  establish that every backend path has the correct policy.

The existing isolated SQL tests cover owner-only erasure, retry, stale-write
rejection, Trust replay/quotas, contribution legacy preservation, LINE fencing,
webhook dedup, budget and role isolation. They do not prove that hosted OAuth,
Storage restoration, or every production permission is correct.

## Local verification result — November 14, 2026

- Python: **3,755 tests passed**, zero failures/errors/skips; JUnit evidence in
  `/tmp/clearpath-database-tests.xml`. No production data fixtures are included.
- Frontend: **499 tests passed** across 106 files.
- Isolated PGlite: unified scalar RPC/numeric migration chain/roles/retention,
  account erasure, Trust, contribution-v3 and LINE delivery suites passed.
- Ruff lint/format, TypeScript, ESLint, Prettier and production **build** passed.
  A build is not a deployment. Commit/push/application deployment were subsequently authorized; database
  cutover remains pending.
- Real production backup restoration, representative load/resource tests,
  two live grid collection rounds, destructive retirement and 24h monitoring
  have **not** passed and must not be inferred from the local tests.

## Rollout gates — NOT passed by preparing local code

1. Reconcile production migration history and compare actual definitions of
   publish/retention RPCs before applying replacements. Review any concurrent edits.
2. Obtain a consistent encrypted backup of current public/private/Trust data,
   required Auth data, sequences, grants, migrations, Storage metadata AND objects.
   Keep keys separately; reconcile objects created/deleted during export.
3. Restore into an isolated environment with cron and all external delivery off.
   Verify FK/unique/sequence state, ID/code, ledger totals, images and authorization.
   A PGlite fixture rehearsal is not a real production backup restore. Current
   environment lacks a configured direct DB connection/full-backup tooling, so this
   gate is pending; do not reuse the old identifier-only backup as current recovery.
4. Apply only reviewed additive SQL after verifying disk/WAL headroom. Verify
   service-only RPC permissions with real roles before enabling the grid-read flag.
5. Verify graph/map equality for the same generation/cell/time, every station's
   geometry, missing cells, partial horizons, stale/expiry and dropped-generation retry.
6. Observe two successful six-hour grid rounds within the existing authorized
   worker window, and exercise collection failure without replacing active data.
7. Disable all old snapshot writers; verify no compatibility consumer remains.
   Make and verify a final targeted snapshot/alias backup before retirement.
8. Only then prepare/apply a separate destructive migration: remove dependent
   views/functions/registry entries, drop exactly the two CAMS station tables
   without CASCADE, and clean only their aliases in bounded batches. No DROP
   migration is placed in the normal migration queue before these gates pass.
9. Validate worker backlogs, retention timestamps and orphan-media candidates.
   Do not introduce a new TTL for data whose policy is unspecified.
10. Observe metrics for at least 24h and one permitted run of each relevant job.

## Storage / migration stop rules

- Stop if backup or checksum checks fail, schema/ledger invariants differ, or
  dependency inspection finds an unexpected consumer.
- Short DDL uses 5s lock and 30s statement budgets; retry after investigation,
  never remove budgets to force through a production lock.
- Start large cleanup at <=500 rows/transaction; protect lease/active references.
  Do not use VACUUM FULL or rebuild the database to recover space on Free.
- Stop heavy writes at 80% disk; at 90% stop optional collectors first, preserving
  privacy/recovery workflows. These thresholds require disk/WAL metrics, not
  `pg_database_size` alone. Missing visibility means unverified headroom.
- Pause rollout on >20% p95 regression for 5min, repeated timeouts, growing queue
  backlog, invalid ledger/FK counts, or privacy/secret exposure.

## Isolated load testing

The runner refuses non-loopback origins, follows no redirects, has no auth or
write endpoints, and requires an explicit isolated-fixture attestation. Configure
an isolated backend/database with delivery/collectors disabled first; localhost
pointing at a production database is not isolation.

```sh
.venv/bin/python -m scripts.load_readonly_api \
  --isolated-fixture --base-url http://127.0.0.1:8000 \
  --readers 10 25 50 --seconds 600 --output /tmp/clearpath-read-load.json
```

Targets: p95 <=2s, errors <1%, real nonempty forecast workload, no growing backlog.
This focused read harness does not replace separate map-history/notification/
write-contention tests or prove production capacity. Full 10/25/50-user tests and
DB/resource monitoring remain pending until an isolated representative database
is available. Never use hosted Free production as a load-test target.

## Rollback and recovery

Before destructive retirement, switch off the new reader flag to use the existing
snapshot path. Stop incompatible new writers before switching code. After table
retirement, restore only the affected CAMS objects/aliases from the verified
backup; do not overwrite newer user data by restoring the entire database.

Before opening any restored environment, reconcile account closures after the
backup timestamp, disable all outbound delivery and preserve sent-event dedup.
An Auth deletion or an already-sent LINE message cannot be reversed by SQL restore.
Record recovery time and data loss explicitly. Trial targets are <=24h backup age
and <=4h measured recovery; neither target is certified by this local change.

## Verification commands

```sh
.venv/bin/python -m ruff format --check backend api scripts
.venv/bin/python -m ruff check backend api scripts
.venv/bin/python -m pytest
node scripts/test-unified-cams.mjs
node scripts/test-account-erasure.mjs
node scripts/test-community-trust.mjs
node scripts/test-contribution-v3.mjs
node scripts/test-line-delivery.mjs
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

The authorized release publishes application code only. Hosted migration, table
drop, backup restore, collector activation and paid-service operations remain
outside this release.
