# Backup and restore rehearsal

Complete this before applying the destructive foundation migration to any
project that might contain reports or evidence.

## Database backup

1. In Supabase Dashboard confirm the project, region and current database size.
2. Link the CLI to the exact project and run `npx supabase projects list` to
   verify the linked marker.
3. Create a private directory outside the Git repository. Ensure it is encrypted
   and excluded from cloud sync if policy requires it.
4. Export schema and data using the current Supabase CLI backup/restore guide.
   At minimum preserve schema, data, roles needed by the application and the
   `supabase_migrations.schema_migrations` history.
5. Record timestamp, project reference, CLI version, file hashes and operator.
6. Never commit a production dump. It can contain email addresses, precise
   locations and audit data.

## Storage backup

A Postgres dump contains Storage metadata, not necessarily the private object
bodies. Back up the `report-images` object content separately using Supabase's
Storage/S3 tooling or an approved export job. Preserve object keys so database
rows still point to the same evidence after restore.

Verify:

- bucket remains private;
- object count and total bytes match before/after export;
- three sampled images can be opened from the encrypted backup;
- no service-role key was written into scripts or logs.

## Restore rehearsal

1. Create a disposable Supabase staging project.
2. Restore the database backup using the official Supabase restore procedure.
3. Restore `report-images` object bodies with the original keys.
4. Point a local backend at the disposable project and run:

   ```powershell
   .venv\Scripts\python -m scripts.production_preflight
   .venv\Scripts\python -m scripts.verify_deployment http://127.0.0.1:3000
   ```

5. Verify row counts for `community_reports`, `report_evidence`, `audit_logs`
   and `sync_runs`; verify signed image access works only for authorized roles.
6. Verify a normal browser cannot list/read the private bucket directly.
7. Record restore duration and any manual correction. A backup is not accepted
   until this rehearsal passes.

## Migration change window

Immediately before migration, stop report intake or announce maintenance, take
a final backup, record the migration SHA-256 from `migration_guard`, preview with
`supabase db push --dry-run`, then apply. Afterward run preflight, readiness and
the critical report flow before reopening intake.

Never run `supabase db reset --linked` against production. That command erases
the linked remote database and is suitable only for throwaway development or
staging projects.
