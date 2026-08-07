# Migration safety

Run the guard before applying any migration:

```powershell
.venv\Scripts\python -m scripts.migration_guard supabase/migrations/*.sql
```

`20260717_production_foundation.sql` intentionally resets pre-production
community tables and deletes objects in `report-images`. Do not apply it to a
database containing data until the database and private storage bucket have
been backed up and a restore rehearsal has succeeded. After those checks, rerun
the guard with `--acknowledge-destructive` and record the SQL SHA-256 in the
deployment change log.

Never rewrite a migration that has already been applied. Add a new forward-only
migration instead.
