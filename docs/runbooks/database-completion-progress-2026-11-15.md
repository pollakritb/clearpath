# Database completion — execution record

Status: targeted migrations applied and verified; application release in progress.
Updated 17 November 2026 Bangkok time.

## Current release authorization and results

The owner's latest instruction is **test, commit, push, deploy and apply migration**.
This supersedes the earlier LOCAL ONLY window. Only the two reviewed additive/
bounded migrations below are applied; global station cutover, flag changes,
table retirement, clones/branches and paid services remain outside this release.

### Recovery and capacity gates

- Captured a consistent native PostgreSQL 17 logical archive and roles on this
  Mac, plus all 44 Storage objects (13,936,054 bytes), without a hosted copy.
- Restored application/private/Trust/Auth/Storage/review/migration schemas into
  an isolated local PostgreSQL 17 instance. Counts and order-independent SHA-256
  checks matched the dump for **116 tables / 240,468 rows**. All 44 images matched
  Storage metadata/checksums and decoded successfully.
- Restored constraints/indexes validated; all 64 public tables retain RLS.
  Actual owner/other-user helper-area RLS and anon private-image isolation passed.
- Both migration files passed apply/rollback rehearsal on this restored data.
  Old-column hashes/counts remained unchanged after apply; no backfill occurred.
- Encrypted the backup with AES-256-GCM, stored its key separately and verified
  decryption plus every archived file hash. Removed plaintext exports and stopped
  the local database. Private backup: `rollout-20261116T235042Z` under the Mac Backups folder.
- Fresh Metrics API measurements before apply showed approximately **1.48 GB
  available of 2.08 GB** on `/data`, above the migration headroom threshold.
- This is application logical-data recovery, not a managed Supabase service
  startup: OAuth/Auth/Storage daemons, cron, pg_net and Vault were not activated
  locally. Platform config/Vault recovery material is encrypted separately within
  the backup. Vercel write-only Secrets cannot be exported and remain unchanged.

### Applied migrations

| Version        | Name                               | Applied UTC                      |
| -------------- | ---------------------------------- | -------------------------------- |
| 20261114202309 | complete_cams_retention_delta      | 2026-11-17T00:12:06.072985+00:00 |
| 20261115062753 | add_operational_display_references | 2026-11-17T00:12:06.072985+00:00 |

Applied atomically with migration history in the same transaction, five-second
lock and 30-second statement budgets. Supabase MCP OAuth was unavailable; the
existing verified direct PostgreSQL connection was used, pinned to project
`kmvxwfrmmictzuxbsncr`. No blanket db push, migration replay or immediate prune/
backfill was executed. The original reviewed migration files were not rewritten.

Post-apply verification passed: five reference columns, valid indexes, unchanged
scalar-reader hash `a57f2d60d3e16a26f8f64a3792237a12`, service-only reader access,
publisher hash `ae2aaa33cb8622454af1660aee331305` and pruner hash
`f197580e8b8b5288478585f03eeae65a`. GPS retention and AQI were already recorded
on production and were not reapplied.

Application source matched the complete local-audit manifest before this release.
Release commits and deployment SHA are traceable through Git history, GitHub
checks and the application's `/api/ready` release field. Post-deploy verification
is recorded in the release evidence outside Git.

## Earlier local-only window (historical)

### Previous scope and observations — 17 November

**Previous owner instruction: LOCAL ONLY — ระวัง code พัง.** This supersedes the
earlier migration-apply authorization from the same day. No further hosted
backup/read/mutation, migration apply, cron/flag changes, commit, push or deploy
will be performed by this cleanup task under the latest instruction.

The observations below were captured before the owner restored local-only scope.

- Supabase MCP cannot refresh OAuth in this session. Read-only inspection succeeded
  through the existing Management API credentials against `kmvxwfrmmictzuxbsncr`.
- Production already records `20261116083327_foreground_alert_gps_retention`:
  hourly GPS retention is active at minute 23, with immediate opt-out cleanup.
  The redundant local-only `20261116082000_hourly_alert_location_retention.sql`
  was archived; it must not be replayed or recorded as a second hosted apply.
- CAMS scalar reader hash remains `a57f2d60d3e16a26f8f64a3792237a12`.
  CAMS retention delta and operational display references are not in hosted
  migration history; the five reference columns are absent.
- Fresh metadata-only audit is private outside Git in
  `~/Library/Application Support/ClearPath/Backups/readiness-20261116T185320Z/`.
  Database size: 230,815,411 bytes. This is not a current recovery backup.
- The owner supplied DATABASE_URL locally. A read-only native PostgreSQL 17
  connection succeeded. The temporary client was downloaded outside the project,
  its app signature verified, and its disk image subsequently unmounted.
- A read-only roles export and pg_dump stream began before LOCAL ONLY was restored.
  The running dump was interrupted immediately; no dump process remains. No
  database/Storage mutation was made. Storage export and restore were not run.
- The partial export is encrypted outside Git with a separate local key and a
  verified encryption round-trip. Its manifest says
  `INCOMPLETE-NOT-A-RECOVERY-BACKUP`; it must not be used as rollout evidence.
- All 19 local PGlite SQL suites passed, including the newly present AQI retirement
  test. These are synthetic fixtures, not a production restore. No hosted
  migration was applied by this cleanup task.

## Historical execution record — through 15 November

## Completed without changing hosted data

- Rechecked production `kmvxwfrmmictzuxbsncr` through bounded READ ONLY
  transactions. The new catalog evidence is private on this Mac under
  `~/Library/Application Support/ClearPath/Backups/readiness-20261114T202147Z/`.
  It remains metadata-only, not a recoverable backup.
- Database size remains approximately 230 MB; WAL approximately 134 MB.
  Filesystem/system/quota headroom is still unverified. Mac free disk was
  approximately 263 GiB.
- Air4Thai subsequently ingested source data at 03:00 Bangkok, 15 November.
  Readiness returned 200 with 122 fresh stations out of 182; no timestamp,
  freshness threshold, scheduler or production data was modified for this result.
  The earlier stale sample is not evidence of persistent database corruption.
- Recent-history cleanup continued to remove 1,000 expired snapshots per run;
  snapshot count declined from 126,382 to 124,382 between observations. Do not
  confuse that normal cleanup with a manual retirement performed by this task.
- Captured only the existing scalar-reader, publishing and retention function
  definitions in the private evidence directory, for drift checks and rollback
  preparation. No user rows or Storage objects were exported.
- Prepared `20261114202309_complete_cams_retention_delta.sql` locally using
  `supabase migration new`. It does not recreate the coordinate reader, backfill,
  create an index, delete rows during apply, stop collectors or drop tables.
  Definition hashes and reader permissions fail closed on unexpected drift.
  The accepted definitions are the audited production state and the exact
  intended target state, allowing a fresh migration chain to converge too.
- Local PGlite rehearsal passed for the actual hosted migration order: permission
  and definition drift rejection, rollback, unchanged scalar reader, repeat
  application, active/latest-two-ready protection and preservation of leased
  generations. Existing unified CAMS SQL tests also passed.
- Focused Python tests passed for unified CAMS, forecast retention, retention
  service and database tool guards. This does not replace the restored-production
  rehearsal or later full release checks.
- Added the user-specified Supabase MCP server to Codex's global configuration.
  OAuth completed and `codex mcp list --json` reports enabled with OAuth auth.
  New MCP tools were not yet exposed in the running agent's tool inventory;
  reload the session before relying on them. No optional skill reinstall was
  necessary because Supabase skills are already installed.

## Historical pending gates — superseded where covered by current results

1. **Current consistent Mac backup and restore.** The available environment
   contains management/OAuth access, but not a direct PostgreSQL connection
   string, and native pg_dump/pg_restore/psql are not installed on PATH. Existing
   `identifier_backup.py` requires maintenance and the old table inventory; it
   must not be reused blindly on the current 63-public-table project. MCP SQL
   query/export alone must not be represented as a verified full database,
   Auth and Storage-object recovery copy.
2. **Disk headroom.** Read actual disk/system usage; database size and WAL totals
   alone do not authorize heavy writes. No hosted backup table/schema, clone,
   branch, replica slot or restore is permitted. Backups and restore rehearsal
   must stay on this Mac, outside Git.
3. **Production delta.** Apply only after backup/restore and capacity gates pass,
   re-reading definitions and concurrent changes immediately beforehand. Never
   replay the earlier broad unified-grid file or blanket db push.
4. **Station cutover and retirement.** Flags/writers remain unchanged. The two
   grid collection rounds, 24-hour observation, final targeted recovery copy,
   old consumer removal, table retirement and bounded alias retirement have not
   been performed.
5. **ID/lifecycle/scalability follow-ups.** New entity display codes, any additional
   lifecycle changes, representative load tests and measured recovery targets
   remain pending; existing Auth/security UUIDs must remain opaque.

## Local verification

Final recheck after the owner's request to review carefully:

- Replaced the simplified privacy-table setup in the display-reference rehearsal
  with the actual account-erasure migration chain.
- Verified real `request_account_erasure` and `complete_account_erasure` RPCs with
  references installed: retry returns the same opaque request ID/code, completion
  still rejects undeleted Auth, and completion/retry retain the reference.
- Verified a failure after display-reference DDL rolls back the new columns as
  part of the same transaction.
- Full backend suite: **3,809 passed**, no failures, one existing TestClient
  deprecation warning; local log `/tmp/clearpath-db-backend-recheck.log`.
- All **nine local SQL suites passed** again. Machine-readable evidence:
  `/var/folders/z2/fn8ysjq142g1twv890c4g86w0000gn/T/clearpath-local-db-2026-11-15T12-12-21-324Z/results.json`.
  The timing is local test execution, not a production latency benchmark.
- ESLint/Prettier for the new scripts, Ruff for the changed Python files, and
  scoped whitespace checks passed. No frontend source was changed by this task.
- No hosted database/MCP request, production backup, apply, commit, push or deploy
  was made in this recheck. Full production restore/resource/rollout gates remain
  pending; successful local fixtures do not close those gates.

The subsequent LOCAL ONLY pass expanded the rehearsal without any hosted reads
or writes:

- Fixed the migration state guard to reject missing/null version or maintenance
  fields, in addition to an explicit maintenance pause.
- Verified failure after function replacements rolls the entire DDL transaction
  back to the original definitions.
- Verified malformed later frames leave no partial frames and preserve the old
  active generation, staged job and retry opportunity.
- Verified expired publication leases are rejected and successful publication
  preserves null cell values, clears chunks and does not bulk-prune generations.
- Verified one expired generation maximum per retention invocation and unchanged
  synthetic user/profile/report/compatibility records through cleanup.
- Added `scripts/test-database-completion-local.mjs`: runs eight fixed local
  PGlite suites sequentially, strips hosted credentials from child environments,
  and writes a machine-readable report under the Mac temporary directory.
  These are synthetic fixtures, not a full production restore or scale test.
- All eight SQL suites passed. The focused backend run passed **25 tests**.

## Further LOCAL ONLY corrections

- Added a service-level guard to `provider_sync.collect_openmeteo_snapshots`:
  when grid-only forecast mode is enabled, direct worker/script calls return
  `retired` before provider access, database reads/writes or retention. The HTTP
  route already had this guard; the service entry now has the same boundary.
  The existing default production flag is unchanged.
- Added station-versus-coordinate grid parity and missing-grid/no-snapshot-
  fallback tests. The focused backend run now passes **42 tests**.
- Prepared additive `20261115062753_add_operational_display_references.sql`
  locally. It adds nullable `code` references for five newer UUID entities:
  privacy requests (`APR`), coverage missions (`MSN`), device evaluations (`DVE`),
  evidence outcomes (`EVO`) and notification batches (`NBT`). PK/FK/Auth identities
  and all browser grants remain unchanged. Batch items retain their composite
  key and refer to their parent's batch code; no extra item identity is needed.
- New inserts receive server-assigned immutable references. Supplied codes cannot
  select another identity. Existing rows receive **no automatic backfill** during
  migration; an operator-only allowlisted helper caps each later batch at 500.
  Local tests exercise 505 missing references as 500 + 5 + 0 calls.
- The nullable columns avoid full-table column backfill/rewrite. Unique indexes
  still need actual hosted capacity/locking review before any future apply.
  These display references are not yet added to API responses or application
  screens; exposing one needs the relevant ownership/visibility contract review.
- The runner now covers **nine** SQL suites. No DROP/retirement migration,
  production flag change, remote backup, commit, push or deploy was performed.

```sh
node scripts/test-database-completion-local.mjs
node scripts/test-cams-retention-delta.mjs
node scripts/test-operational-display-references.mjs
node scripts/test-unified-cams.mjs
.venv/bin/python -m pytest backend/tests/test_unified_cams.py \
  backend/tests/test_forecast_retention.py backend/tests/test_retention_service.py \
  backend/tests/test_database_tool_guards.py
```

Other concurrent work exists in this shared checkout. This task does not commit,
overwrite or deploy those edits. The local candidate is not proof of hosted
application, complete recovery, or million-user capacity.
