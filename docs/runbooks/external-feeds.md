# Scheduled external feeds

Status: implemented locally; production activation requires the migrations,
server deployment and environment switch below. No production changes are made
by running unit tests.

## Data flow

Supabase Cron calls the authenticated `/api/cron/external-feeds` dispatcher every
five minutes. Database due times enforce Google News checks once per hour and
NASA FIRMS checks every thirty minutes. The five-minute dispatcher is also how
failed attempts retry at the next five-minute slot, then three slots later; subsequent
failures wait one source cadence. These are ClearPath collection policies, not
upstream publication guarantees. Cron delivery and upstream processing can be
late; always display actual successful check timestamps.

Each source has an independent row lock and two-minute lease. A second caller
cannot fetch the same source while its lease is active. A worker with a lost
lease cannot publish; interrupted runs can be reclaimed. Each run records start,
completion, counts, filtered entries and a sanitized error code. Duration is the
difference between completion and start. Failed publication rolls back together
with its run update, keeping previous good data intact.

## Google News

- Request the Thai Google News Search RSS feed for the configured air-quality
  query and a seven-day window. Require an air-quality keyword in the headline,
  a publisher, an HTTPS link and a valid publication date. This is a conservative
  metadata filter, not human fact-checking or proof of geographic relevance.
- Parse all feed entries rather than stopping at five. The RSS feed itself is a
  bounded search result and does not guarantee exhaustive coverage of all news.
- Store GUID, title, publisher, source link, publication timestamp, first/last
  seen timestamps and content-update timestamp. Never store full articles,
  copied descriptions or publisher images. Source links are the RSS links;
  Google redirect URLs are not resolved through scraping.
- Deduplicate GUID or exact source link. Different publishers covering the same
  event remain separate. Update metadata while preserving first-seen time.
- Save ETag/Last-Modified when supplied. Reuse validators only for the same query
  URL; a 304 is a successful check without erasing stored items. Header support
  is optional and is not assumed to exist at Google.
- Retain metadata for thirty days by publication date. The API lists the last
  seven days, merged with internal announcements, in pages of ten. The API and
  browser cache are each one minute; refresh reads ClearPath storage, never
  bypasses the scheduler to poll Google.
- `checked_at` is the last successful source check, not the article publication
  time. `pending`, `failed`, `stale`, and `ready` are distinguishable. A failed
  check keeps the old news; an empty successful feed does not delete history.

## NASA FIRMS

- Fetch VIIRS S-NPP, NOAA-20 and NOAA-21 Area API products concurrently for the
  Thailand bounding rectangle. Filter through the same country multipolygon as
  the frontend map (including islands, excluding neighbors and sea).
- Geometry checks are pure. `backend/algorithms/thailand_boundary.py` embeds the
  existing frontend geometry so Python deployment is self-contained; a parity
  test catches any drift when either boundary changes.
- Publish observations no older than twelve hours and never future timestamps.
  Reapply freshness at read time, even when a stored snapshot is older. Preserve
  cross-product deduplication. No brightness/FRP value is a PM2.5 measurement.
- Store the latest successful snapshot in `external_feed_sources`. The map and
  alert workflow use this snapshot when storage mode is enabled. Requesting
  `days` on the public API does not expand the twelve-hour publication window.
- A failed check keeps fresh points from the last snapshot with an unavailable
  status; it never becomes a false “no hotspots” response. Checks older than
  three hours are also marked unavailable. Unconfigured is a separate state.
- This is near-real-time satellite evidence, not a confirmed active fire. The
  approximate three-hour NRT publication latency after observation is not an
  “every three hours” observation schedule.

## Security and monitoring

All three tables have RLS enabled and no anon/authenticated grants. Only the
server service role can read/write feed storage and execute ingestion RPCs.
Cron credentials come from the existing ClearPath Vault entries; browser
requests cannot trigger collection. Admin permissions are unchanged.

The dispatcher returns per-source health and emits `external_feed_overdue` at
ERROR level after three hours without success (including a source that has
never succeeded). Configure the hosting log alert for this event to deliver an
operator notification. This change does not automatically configure a provider
email/LINE alert destination. Inspect `external_feed_runs` and source state to
diagnose failures. Last-good data and last-attempt time are kept separately.

## Activation order

1. Run the migration guard for the two `scheduled_external_feeds` files. Apply
   the storage migration first using the project's normal migration process.
2. Deploy the backend/frontend with `EXTERNAL_FEED_STORAGE_ENABLED=false`.
   Existing on-demand behavior remains available until the storage is ready.
3. Apply the cron migration. It requires existing `pg_cron`, `pg_net` and Vault
   secrets `clearpath_production_url` and `clearpath_supabase_cron_secret`. Its
   target remains disabled while the environment switch is false.
4. Enable server-only `EXTERNAL_FEED_STORAGE_ENABLED=true` and redeploy. Keep
   `GOOGLE_NEWS_ENABLED=true`, `FIRMS_MAP_KEY` and scheduler tokens configured.
5. Invoke the authenticated dispatcher once, verify both source states and
   records, then verify news and FIRMS public APIs. An unavailable source is not
   a successful live-data check. No real hotspot is fabricated for testing.
6. Confirm subsequent scheduled runs in Supabase Cron and feed-run records;
   configure the operator log alert. Verify mobile news pagination and a real
   observation's source time. Until completed, do not describe production as
   using scheduled storage.

If rollback is needed, disable the environment switch. Keep the additive tables
and their data; do not roll back through destructive migrations. Disable the
cron job if collection is no longer desired.

## Local verification

```sh
.venv/bin/python -m pytest backend/tests/test_feed_sync.py backend/tests/test_google_news.py backend/tests/test_thailand_hotspots.py backend/tests/test_alerts_service.py
node scripts/test-external-feeds.mjs
npm run typecheck
npm run test:unit -- frontend/components/panels/community/AnnouncementsSection.test.tsx frontend/lib/api-client.test.ts
```

The SQL test uses isolated PGlite PostgreSQL, never the live Supabase project.
It verifies leases, deduplication, metadata changes, retries, validators,
snapshots, transactional rollback, retention and role isolation. It does not
prove delivery by the hosted cron scheduler.
