# Supabase Support request — ready to copy, not sent

**Subject:** Existing Free project cannot start: WAL disk full / PostgreSQL 57P03 — request no-cost recovery assistance

Hello Supabase Support,

Please help recover the existing project without a paid upgrade if a safe
platform-side recovery is available. The owner has explicitly declined paid
changes. Please do not upgrade the subscription or incur charges.

- Project: **ClearPath**
- Project reference: **qnrtryspglioqhdxglzu**
- Region: **ap-southeast-1**
- Plan: **Free**
- First observed disk-full error: **2026-11-01 01:52:51 UTC**

During a migration from UUID application keys to BIGINT keys, the backfill
created more temporary WAL than expected. The database now repeatedly enters
recovery and rejects SQL connections. We stopped submitting migration work.
The project-level status says ACTIVE_HEALTHY, but the database service health
check reports UNHEALTHY.

Relevant PostgreSQL log messages:

```text
2026-11-01 01:52:51 UTC
could not write to file "pg_wal/xlogtemp.432452": No space left on device

2026-11-01 01:54:39 UTC
could not write to file "pg_wal/xlogtemp.433327": No space left on device

FATAL: 57P03: the database system is not accepting connections
DETAIL: Hot standby mode is disabled.
```

The application database size before migration was approximately **292.8 MiB**;
that measurement did not include WAL. The largest backfill table was
`forecast_provider_snapshots`, containing **286,917 rows**. Its numbering
UPDATE completed once in approximately **226 seconds**. Earlier attempts hit
a 120-second SQL timeout; one diagnostic wrapper failed to parse. The last
attempt used a 300-second maintenance timeout and then exhausted WAL disk.

A consistent encrypted application backup was completed while writes and
application cron jobs were paused. Its restore and migrations were rehearsed
successfully in an isolated local PostgreSQL-compatible engine:

- 44 application tables, 586,792 rows.
- 21 Storage object bodies; all checksums verified and 3 sample images opened.
- Every original application column preserved in the rehearsal, with zero FK
  orphans.
- Backup includes schema/privilege/trigger/index/policy metadata and migration
  history. It includes Auth user IDs for FK verification, **not a full Auth
  credential/identity/session backup**.

Please prioritize recovery of this **existing** project so Auth identities,
sessions, private Storage objects and application data are retained. Please
advise whether platform-side space recovery or another no-cost recovery path
is available. We understand that a no-cost recovery is not guaranteed.

The final migration transaction outcome is **not confirmed**. The last observed
application control state was version 1 with maintenance on. Please do not
blindly replay the migration or reset the database.

After SQL access is available, please inspect/remove the one-off migration job
named `clearpath-identifier-cutover-20261101-v3` (job ID 7), if it still exists.
It was scheduled for one specific UTC minute/day/month, not every minute.
Original application cron jobs 2, 3 and 4 were paused. They should remain paused
until schema state, row integrity and write safety have been verified.

The attached sanitized evidence contains no database dump, photos, user data,
access tokens, passwords, service-role key, or backup encryption key. We can
provide further non-secret diagnostics on request.

Thank you.

---

Owner handoff: open [Supabase Support](https://supabase.com/dashboard/support/new),
select ClearPath, paste the message above and attach the sanitized evidence ZIP.
If that support route is unavailable on the Free plan, use the support options
shown by the dashboard. No request has been sent by the agent.
