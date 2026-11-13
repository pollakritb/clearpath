# Account closure

Account deletion is owner initiated through `/api/community/me/deletion-request`, with a verified login within five minutes, the exact confirmation phrase and explicit retention acknowledgment. Administrator and Moderator APIs remain read-only.

`ACCOUNT_PRIVACY_ENABLED=true` requires the `account_erasure_lifecycle` migration. A database transaction records a durable job, blocks the profile, hides its public identity and stops notifications. Stale writes are rejected under a profile lock. The service removes unsubmitted draft images through Storage, deletes the Supabase Auth user (including its sessions), and only then completes private settings cleanup. Completion verifies Auth absence in the database. The request is never marked complete merely because it was accepted.

Published measurements, original report evidence under existing retention/audit holds, XP and trust/audit ledgers remain under the existing policy. The profile becomes an anonymous tombstone so deleting Auth cannot cascade through those ledgers. Google identifiers and profile identity are detached; comments, private saved locations, preferences, notifications and draft records are removed. Measurement request place names and coordinates are reduced to anonymous coarse locations. This is account closure with limited retention, not a promise that every historical audit record or backup has been erased. Signing in again creates a new account; it does not restore the closed profile.

Failures retain the job manifest and retry on the existing measurement-request scheduler. `/api/cron/account-erasure` is also available with the existing server-only cron authentication. No private paths, Auth identifiers or exception bodies are returned to the browser or logged. Database completion and external deletion are idempotent. The deployment operator owns retry monitoring: the cron result reports processed/failed counts. An unresolved job must be investigated without marking it complete manually.

OAuth return URLs must explicitly allow `/settings/privacy` on each configured app origin so fresh authentication returns to account settings.

Before enabling: run `node scripts/test-account-erasure.mjs`, backend account-privacy/erasure tests and the UI checks. Verify a disposable account against the deployed schema and Auth/Storage integration; never use a real user's account as a test fixture. Retain only aggregate verification evidence. Production verification must confirm no pending jobs and an active protected scheduler.

Restores: keep the closure completion record and anonymous tombstone with database backups. Before reopening a restored environment, replay all closures completed after that backup, remove their Auth users and private data, and verify that their Google/Auth identifiers and draft images are absent. Existing backup retention applies; this release does not introduce a new legal retention period.
