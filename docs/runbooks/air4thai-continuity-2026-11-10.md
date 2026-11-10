# Air4Thai hourly continuity repair

The production audit found successful primary syncs at :17/:47. An hourly
observation therefore crossed the strict 60-minute Place IDW cutoff before the
next ingestion, even while the scheduler was healthy. A browser could add up to
five minutes through its normal public-data refresh interval.

Migration `20261110002811_air4thai_continuity_5m.sql` changes the existing
Vault-backed job to `2-57/5 * * * *` (12 central polls/hour). Its historical job
name remains `clearpath-air4thai-sync-30m` for compatibility with existing
operations references. The migration refuses missing, inactive or unexpected
jobs and can be retried. It changes no permissions, measurements or user data.

The server cache expires after 60 seconds, below the polling interval, to avoid
reusing the previous snapshot when the next invocation arrives slightly early.
GitHub backup skips only within ten minutes of a successful primary execution.
The browser continues polling the Supabase-backed API, never Air4Thai directly.

This reduces additional collection lag after the source publishes a new hour;
it does not create continuous real-time measurements. Source publication delays,
failed polls and outages can still leave no current estimate. The 60-minute
Place IDW and 180-minute community limits are unchanged. Old measurements remain
visible separately, and forecasts remain labelled as forecasts.

The UI now identifies zero fresh stations explicitly instead of advertising the
total as ready. Nearby measurements under two hours old show age in minutes so
67 minutes is not rounded down to an apparently eligible one-hour observation.
The unsupported `browsing-topics` Permissions-Policy directive was removed while
camera, geolocation and microphone restrictions remain.

Production smoke now allows up to 60 attempts (15-second pauses) within a
20-minute job timeout to cover the observed hourly publication delay. It still
requires fresh observations and the exact release SHA. Its failure diagnostic
also avoids the shell default-expression brace that appended invalid JSON.

Verification: Python ingestion/cache and backup tests; PGlite migration retry,
command preservation and drift guard; React stale-count and source-age tests;
mobile browser stale-to-fresh recovery at 320/360/390/430px. These checks do not
represent one million authenticated users or a production load test.

After applying, inspect only non-secret cron metadata and successful
`air4thai_supabase_primary` sync runs across successive five-minute slots.
Rollback is `cron.alter_job(jobid, schedule := '17,47 * * * *')` on this verified
job only. Never edit observation times or extend freshness to mask an outage.
