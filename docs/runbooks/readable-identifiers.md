# Readable database identifiers

Baseline: production `422013d`, 44 public tables, XP migration `20261030213750`.

## Implementation state

The repository contains the **expand migration and its rehearsal**. Production application PK/FKs, Auth, APIs, tokens and links still use their existing UUIDs. No cutover release is included in this migration. Do not drop/rename legacy columns, enable a cutover switch, or claim that the complete ID migration has shipped.

The migration adds 19 UUID-entity numeric identities plus readable codes for 23 entity tables (four already have numeric primary keys), 50 numeric relationship columns, a separate MBR identity, private legacy aliases and 44 restricted review views. Existing business values, RLS ownership policies and UUID PK/FKs remain intact.

- [Data dictionary](../database/data-dictionary.md)
- [ERD](../database/erd.mmd)
- [Exam walkthrough and remaining cutover requirements](../database/exam-walkthrough.md)

## Local rehearsal

```sh
npm run test:identifiers:db
.venv/bin/python -m scripts.migration_guard supabase/migrations/20261101002656_readable_identifiers_expand.sql
```

The rehearsal uses a sanitized schema-only fixture and dummy data. It verifies old column preservation, sequences, relationship synchronization, cascades, long codes, legacy alias reuse rejection, private permissions, existing ownership RLS, write-RPC retry behavior, and transaction rollback after a forced error. Never put production data in the fixture.

Review the migration especially for `jsonb_populate_record` write RPCs: after adding generated columns an unrestricted `INSERT ... SELECT *` attempts to write those columns. The expansion changes those three inserts to explicit original column lists, preserving existing business decisions and deduplication keys.

## Before any production apply

1. Recheck HEAD, deployed commit, the live 44-table catalog, constraints, trigger enabled states, RPC definitions and migrations. Stop on drift; do not blindly use the baseline fixture as a production schema restore.
2. Save a full private backup with a tested restore. Include schema, business rows, migration history, grants/policies/functions/triggers, and private Storage metadata; retain existing image object paths.
3. Rehearse the migration against the restored backup. Compare every original column and row count, sequences, relationship orphans, business counters, timestamps, XP, public coordinates and idempotency material.
4. Bound the write interruption; wait for in-flight workers and writes, and keep reads available around the short DDL window. Set lock/statement timeouts. The expansion takes table locks and bulk backfills; measure their duration using the actual restored dataset.
5. Apply the entire file in **one transaction**, with migration history recorded in the same transaction. Never execute its statements one at a time. Trigger state capture uses an ON COMMIT DROP temporary table and SET LOCAL timeouts.
6. Verify the existing application and workers before reopening writes. Do not restore all user triggers with a blanket ENABLE command: original disabled/replica/always states must be preserved.

The migration temporarily suppresses existing user triggers only while table locks are held during the backfill, restoring each exact prior state. This prevents an identifier-only backfill from changing report engagement counters, timestamps or XP queues. Original FK triggers remain active. Any SQL failure must roll back the entire transaction and release locks.

## Read-only live inspection

```sh
.venv/bin/python -m scripts.database_identifiers
.venv/bin/python -m scripts.database_identifiers --require-expanded
```

The script reads the management token from the environment or `.env.deploy.local`. Output contains table names and counts, no tokens or user rows. Every SQL request runs in a read-only transaction. The second command fails if readable codes/numbers are missing or inconsistent; it does not apply the migration.

## Rollback and follow-up

If expansion fails before commit, roll back its transaction. If a committed expansion causes a problem, prefer leaving the additive columns unused while correcting the issue; the deployed UUID application continues using its original keys. Do not drop mappings/sequences after new records have been allocated and do not renumber identifiers.

The cutover requires a separate tested release: numeric PK/FKs and RPC types, `auth_user_id` linkage, entity-aware legacy/code resolution, stable privacy/dedup namespaces, old signed tokens/images, typed API/frontend changes, demo mode and all workers. Stop before switching production keys until these dependencies are implemented and verified. After writes reopen, use forward fixes rather than restoring an older backup over newer data.
