# Identifier cutover recovery — 2026-11-01

## Current status: blocked by WAL disk exhaustion

Do **not** report the numeric production cutover as complete. The compatible
application bridge is deployed at commit `0a24be6`. The last confirmed database
state before recovery was version 1 with global maintenance enabled. Confirm
its actual state after the database accepts connections again.

The PostgreSQL log recorded:

```text
2026-11-01 01:52:51 UTC
could not write to file "pg_wal/xlogtemp.432452": No space left on device

FATAL: 57P03: the database system is not accepting connections
DETAIL: Hot standby mode is disabled.
```

A subsequent recovery attempt also ran out of WAL disk space at 01:54:39 UTC.
The project-level status said ACTIVE_HEALTHY, but its database health endpoint
reported UNHEALTHY. Do not use the project status alone as a recovery signal.

The identifier migration underestimated temporary WAL usage. Full-table
backfills on this Free project exhausted disk during the migration; increasing
statement timeouts did not address disk capacity. No further migration jobs
should be submitted until the database is recovered and disk headroom is checked.

## Owner decision

The owner explicitly declined paid changes and requested a support handoff.
Do not upgrade or incur charges. The support request is prepared but not sent.
See the [ready-to-copy support request](../support/clearpath-supabase-recovery-2026-11-01.md)
and sanitized evidence.

## Verified recovery artifacts

Encrypted application backup:

```text
~/Library/Application Support/ClearPath/Backups/identifiers-20261101-v2/
```

Private unpacked rehearsal and diagnostics:

```text
~/Library/Application Support/ClearPath/Backups/identifiers-20261101-v2-restore/
```

The Fernet key is stored separately under `~/.clearpath-backup-keys/` with mode 0600. Backup and restore directories have mode 0700. Never commit their contents
or send the key, account data, locations, photos, or tokens to support.

Verified before production cutover:

- 44 public application tables, **586,792 rows**.
- 21 Storage object bodies, all checksums verified; 3 sample images opened.
- Full application-row restore and both ID migrations rehearsed in isolated
  PGlite, with every original column preserved and zero FK orphans.
- Rehearsal completed in 349 seconds.
- Baseline application database size was 292.8 MiB. This excludes WAL and other
  disk usage and therefore was insufficient as a migration capacity estimate.

The backup contains application rows, schema/ACL/policy/trigger/index metadata,
migration history, Auth user IDs for application FK verification, Storage
metadata and encrypted object bodies. It is **not** a complete Auth credential,
identity-provider, or session backup. Prefer recovering the existing project;
do not replace Auth from this application snapshot.

## Migration attempts and execution state

1. Management API execution hit HTTP 524. A subsequent check found no committed
   expansion columns/aliases or cutover history.
2. One-off cron job 5 hit the 120-second SQL statement timeout and was removed.
3. One-off cron job 6 failed to parse diagnostic instrumentation and was removed.
4. One-off cron job 7 (`clearpath-identifier-cutover-20261101-v3`) ran with a
   300-second maintenance timeout and hit WAL disk exhaustion.

Job 7 was scheduled for a specific UTC minute/day/month, not every minute. It
may remain in cron after recovery; inspect and remove that exact job before
resuming normal workers. Do not infer completion from intermediate pg_cron
`succeeded` messages for a multi-statement batch. Check schema version,
migration history, columns, constraints, and actual transaction outcome.

The original cron jobs were recorded privately in
`identifier-cron-state.json` beside the encrypted backup directories. Their
IDs were 2 (Air4Thai), 3 (measurement requests), and 4 (community XP), all active
before maintenance. They were paused and must be restored only after checks.

## Recovery steps

1. Obtain explicit owner approval before any paid plan change. At inspection,
   this organization contained one project, ClearPath.
2. Supabase documents that a Free disk is fixed at 2 GB and that WAL can fill it
   even when application data is below the database-size quota. For a database
   already down due to a full disk, its documented path is upgrading to Pro,
   restarting the project, and allowing recovery time. See
   [Supabase disk recovery](https://supabase.com/docs/guides/platform/database-size#free-plan-behavior).
3. If the owner declines a paid change, prepare a support request using the
   non-secret draft below. Do not send it without explicit instruction.
4. After capacity is available, restart the existing project if needed and wait
   until both database health and an actual read-only SQL connection succeed.
5. Inspect `private.identifier_control`, the migration history, the two schema
   representations and cron job 7. Do not blindly reapply or restore over data.
6. Check **total disk/WAL headroom**, transaction-log retention and failed-work
   bloat. Reassess the backfill plan before trying again: keep a bounded working
   set and sufficient headroom; do not rely on raising timeout alone.
7. Reuse the verified encrypted backup as recovery evidence. If the application
   rows changed, take a fresh consistent backup before another attempt.
8. Complete key/RPC/RLS verification, rollback-only write smoke tests, legacy
   aliases/tokens/images, and public API checks before reopening writes.
9. Restore the three original cron states, run a bounded Air4Thai sync, and
   verify station freshness/readiness. Remove the one-off migration job.
10. Update the data dictionary, ERD, exam walkthrough and final deployment
    evidence only from the verified final catalog.

Never use `supabase db reset --linked`, delete WAL files, drop Auth/Storage,
restore an old backup over new records, or change billing without approval.

## Support draft — not sent

Project reference: `qnrtryspglioqhdxglzu`, region `ap-southeast-1`.

> The existing Free project cannot accept SQL connections after WAL disk
> exhaustion during an application identifier backfill. PostgreSQL repeatedly
> logs `No space left on device` for `pg_wal/xlogtemp.*`, followed by automatic
> recovery and 57P03 / hot standby disabled. The first observed disk-full error
> was 2026-11-01 01:52:51 UTC. We stopped submitting work and have a verified
> encrypted backup of all 44 application tables and 21 Storage objects. Please
> advise on recovering the existing project's disk/WAL capacity while preserving
> application data, Auth identities and Storage. Do not reset the project. The
> last confirmed application migration-control state was version 1/maintenance
> on; the final transaction outcome still needs verification after recovery.
