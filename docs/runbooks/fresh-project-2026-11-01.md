# ClearPath_Final — replacement database

Current inventory: **41 public tables and 41 review views** after retiring the three empty model-input/quality tables on 2026-11-01. Earlier counts below describe the bootstrap snapshot.

The replacement project is `kmvxwfrmmictzuxbsncr` (Seoul,
`ap-northeast-2`). The old project `qnrtryspglioqhdxglzu` and its encrypted
local backup are retained. No paid upgrade was performed.

## Owner decisions

- Import only the latest 72 hours of official observations and necessary master
  data. Keep the full historical backup on the owner's computer.
- Retain the latest successful forecast batch for **each** station batch, rather
  than importing every historical forecast issue. Future valid times in those
  forecasts must remain available.
- Start user accounts and user-associated data from scratch, following the
  owner's “ล้างให้หมด” reply to the account-recovery question. Do not import old
  profiles, community reports, images, Trust/XP history, preferences, LINE links,
  camera sessions, messages, leases or unfinished jobs.
- Configure Google OAuth on the replacement project. The owner supplies the
  credentials privately and adds the new callback in Google Cloud.

## Verified initial import

The frozen seed window is **2026-10-29 03:35 UTC through 2026-11-01 03:35 UTC**.
This is a rolling 72-hour window, not three Thai calendar dates. Subsequent
normal ingestion and retention change the live counts.

| Data                                                 | Initial rows |
| ---------------------------------------------------- | -----------: |
| Station master                                       |          177 |
| Official PM2.5 observations                          |       10,442 |
| Completed station sync runs                          |          140 |
| Latest successful forecast runs, all 6 batches       |            6 |
| Forecast snapshots for those batches                 |       17,346 |
| Active CAMS grid definition / generation / pointer   |    1 / 1 / 1 |
| Frames belonging to the active CAMS generation       |          120 |
| Fresh XP control singleton                           |            1 |
| Old user accounts / community reports / image bodies |            0 |

The import uses transactions of at most 200 records. Every batch compares the
actual typed PostgreSQL values with its expected records. An independent local
restore computes row fingerprints; all imported tables matched their live
fingerprints before writes were enabled. No foreign-key constraint is disabled
during the replacement import.

Initial application database size after import was approximately **37.6 MiB**,
with approximately **112 MiB of WAL**. These are measurements, not future space
guarantees. The importer stops at conservative database/WAL thresholds instead
of increasing statement timeouts or retrying a resource failure.

## IDs and access

All 23 entity types use numeric database primary keys and generated readable
codes, such as `USR-000003`, `CAP-000002`, `RPT-000002`, `REQ-000001` and
`CFS-017347`. The database allocates the number; API clients receive strings.
Numbers can have gaps after rollback or deletion and are never calculated with
`MAX(id)+1`. Six digits is a minimum display width, not a maximum.

All 50 identifier relationships and the separate MBR identity were inspected
successfully on the replacement database. Live rollback-only smoke checks
created profile, camera and report codes; the test rows were rolled back.
Auth UUIDs and security/idempotency/lease tokens remain opaque. Station/grid
natural keys remain provider-defined. Readable codes do not grant access.

Application tables have RLS enabled. Direct client privileges are restricted;
the backend uses its server-only key. Private report images use a private
bucket. Source code, documentation and Git never contain the credentials or
private seed artifacts.

## Storage growth control

`supabase/bootstrap/recent_history_retention.sql` installs a private retention
function. The `clearpath-recent-history` cron calls it every 10 minutes, with
at most 1,000 deletions per history table per run. It skips work during global
maintenance and uses an advisory lock to avoid overlapping cleanups.

It expires official observations, weather/fire snapshots, quality summaries,
forecast issues, station sync history and rate-limit windows older than 72
hours. Provider runs are deleted only after no retained snapshot references
them. The active CAMS generation is protected. Retired telemetry aliases and
cron execution logs are bounded too. User/community/Trust/XP evidence and their
compatibility aliases are outside this policy.

Ordinary deletes allow PostgreSQL to reuse space and WAL recycling happens
through normal checkpoints. Do not run `VACUUM FULL`, reset, drop tables or
manually remove WAL as a routine cleanup.

## Reproduction and release checks

Private artifacts are under:

```text
~/Library/Application Support/ClearPath/Backups/fresh-project-20261101/
```

These include the frozen manifest, schema, selected JSONL rows, sequence repair,
local fingerprints and live verification reports. File contents are not
committed. `.env.target.local` contains replacement credentials and is ignored
by Git; `.env.deploy.local` contains Management API and deployment credentials.

Preparation and rehearsal have no network access:

```sh
node scripts/prepare_fresh_database.mjs PRIVATE_BACKUP PRIVATE_OUTPUT AS_OF_ISO
node scripts/test-fresh-database.mjs PRIVATE_OUTPUT
```

The importer explicitly rejects the old project, requires the expected new
project name and a fresh empty schema for bootstrap, checks seed hashes, and
keeps maintenance on until a separate release decision:

```sh
python scripts/import_fresh_database.py PRIVATE_OUTPUT --project NEW_REF --apply-schema
python scripts/import_fresh_database.py PRIVATE_OUTPUT --project NEW_REF --finalize-only
python scripts/database_identifiers.py --project-ref NEW_REF --require-expanded
```

Do not rerun the importer after opening writes. It intentionally requires
maintenance. Do not replay the historical migration directory against the new
project: the fresh schema bootstrap already applies the identifier conversion
on empty tables. Use a reviewed incremental change for future schema updates.

The Vercel rollout changes the frontend URL/anon key, backend URL/service key,
CAMS expected project reference, and the independent Supabase cron credential.
The GitHub backup cron credential and unrelated existing production secrets are
preserved. New application cron jobs remain inactive until the deployment is
ready and a primary sync succeeds. Check station freshness, public APIs,
Google OAuth callback and job execution after switching. A Google redirect
smoke test is not a complete interactive login test; the owner must finish a
real Google login before confirming end-to-end account access.

## Public compatibility-column removal (schema version 3)

On 2026-11-01, migration `20261101043458_private_identifier_aliases.sql`
removed **all 70 `legacy_id` / `legacy_*` columns** from the 44 public tables.
Public PK/FK columns remain numeric and readable `code` columns remain
DB-generated. The private alias registry is retained for retry idempotency,
stable privacy seeds and old links; it is not exposed through the Data API.

Before this operation the project already had a real user. Signup, application
writes and all four cron jobs were paused; a new encrypted snapshot captured
all application tables, 27 Auth tables and current Storage metadata/bodies.
The snapshot is outside Git at `Backups/before-clean-v3-20261101/`, with its
key stored separately. The restore rehearsal used Auth ID stubs for application
FK checks, retained the encrypted full Auth snapshot, compared every retained
business column before and after, and verified all 17,501 private alias rows.
It did not exercise full Supabase Auth-service recovery locally.

The live migration compared per-table value fingerprints, alias fingerprints
and Auth user IDs inside the same transaction. Any difference would have
aborted the DDL. The operation committed with zero public compatibility
columns, the existing user retained and maintenance still on. Rollback-only
live RPC checks passed before restoring the original signup/cron states.
Real Auth JWT → profile/MBR → capture-session and ownership RLS were then
verified using a temporary account that was deleted afterwards. Production
Air4Thai sync returned a readable `SYN` code and readiness returned 200.

Schema version 3 routes retry-key inserts through service-only
`identifier_insert`, with explicit writable-column validation and per-key
advisory locking. Retry keys remain in the private registry and are never
numeric PK allocation by the caller. Existing read-only requests that cross
the schema commit may be rebuilt once; mutations are never replayed after an
uncertain network exception. The backend resolves private privacy metadata in
batches and does not expose it through public response models.

## Retired model feature tables

Migration `20261101065151_retire_model_feature_storage.sql` removed only
`weather_observations`, `fire_feature_snapshots`, and
`forecast_data_quality_daily`, plus their three review views. All were confirmed
empty and their schema/dependency metadata was saved privately before DDL.
The migration locks and rechecks emptiness, uses no CASCADE, and replaces
`private.prune_recent_history` before dropping the tables. Unexpected data or
an unreviewed dependency aborts the transaction.

The legacy model-input collector and quality reconciliation now return explicit
retired responses with no provider/DB I/O. The old live training exporter
fails before querying. Production preflight requires retained storage only.
Public weather, raw CAMS, the map and satellite-hotspot layer retain their
independent adapters. In particular `/api/firms` still calls `fire_feed` and
FIRMS, preserving the Nakhon Pathom / 12-hour hotspot policy.

Verified locally: nonempty-table rejection, 41 public tables/views, retained
CAMS/community storage, cleanup after the drop, and FIRMS layer response with
DB access forbidden. Backend: 501 tests, 81.43% coverage.
