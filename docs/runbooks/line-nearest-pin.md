# LINE nearest-pin alerts

Implemented locally on 2026-11-13. Production migration and activation are separate release steps. No production database was changed and no real LINE messages were sent during implementation.

## Policy

- Select the nearest eligible station or approved community report to the owner's latest foreground GPS **before** comparing PM2.5 against the threshold. A farther high reading must never override a nearer low reading.
- GPS accuracy ≤200 m; observed timestamp ≤24 hours old. The browser sample timestamp is preserved. A search result, helper area or map center never becomes notification GPS.
- Stations ≤60 minutes old; approved community reports ≤180 minutes old. Community distances use stable public coordinates only. No exact-coordinate fallback, Trust gate, IDW or forecast value.
- Maximum source distance uses the existing saved radius (default 10 km, 1–50 km). Minimum threshold remains 37.6 µg/m³. These age/accuracy limits are product policy, not international health standards.
- Alert once on entering a warning episode and again if severity increases above 75. A source switch alone does not reset the episode. Recovery requires observations below the threshold over 30 minutes; missing data breaks that recovery interval. Normal re-entry waits at least 60 minutes; escalation bypasses that pause.
- One pending air alert per user. Quiet hours defer without spending attempts. If the pending context becomes obsolete, fenced completion rolls back only the pending decision and re-evaluates the latest data. Acknowledged notifications remain historical events.
- Automatic LINE categories remain request/help, request fulfilled and air alert. Helper areas are unchanged.

## Local verification

```sh
.venv/bin/python -m pytest
node scripts/test-line-delivery.mjs
npm run test:unit
npm run format:check
npm run lint
npm run typecheck
npm run build
.venv/bin/python -m ruff format --check backend api scripts
.venv/bin/python -m ruff check backend api scripts
```

`test-line-delivery.mjs` runs the migration on an isolated PGlite PostgreSQL database after the real numeric identifier cutover. It checks location CAS, atomic state/outbox, stale-worker fencing, lease recovery, webhook dedup, one-time linking and out-of-order unfollow, shared rate budgeting, RLS and evaluation claims. It never connects to hosted Supabase.

## Migration and activation

1. Review and apply `20261113060929_line_nearest_pin_notifications.sql` to local/staging first. Use the repository's migration workflow and database advisors on the target. The additive migration expects the numeric identifier schema.
2. Stop legacy consumers and drain/resolve their pending deliveries before the cutover. Investigate any legacy request with an uncertain provider outcome; do not regenerate it with a different key/body. New inbox acceptance preserves unexpired legacy webhook dedup IDs. Check actual primary/backup scheduler configuration. Deploying a worker is a separate hosting task; a Vercel request is not a persistent worker process.
3. Set `LINE_DURABLE_DELIVERY_ENABLED=true`. Set a **positive** `LINE_MONTHLY_MESSAGE_CAP` below the OA's real allowance and `LINE_REQUESTS_PER_SECOND=5` initially. A missing cap fails closed. The budget is shared across processes and reserves capacity conservatively even for uncertain attempts. It does not replace the official usage/allowance checks in LINE Console.
4. Enable `PUSH_ENABLED=true` for PM2.5 evaluation; use `LINE_ALERT_SHADOW_MODE=true` initially. This computes/logs non-identifying decisions without creating notifications or advancing episodes.
5. Run `.venv/bin/python -m scripts.line_worker --once` in staging, then run continuously with process supervision. Start with separate `--role inbox`, `--role evaluation` and `--role outbox` processes so slow source evaluation cannot delay reply tokens. Add outbound processes for bounded concurrency. Each outbound process claims one delivery at a time; queries use leases/SKIP LOCKED. Evaluation batches are bounded and leased separately. The default `--role all` is for a simple local/staging smoke run.
6. For an authorized opt-in canary, set `LINE_ALERT_SHADOW_MODE=false` and `LINE_ALERT_CANARY_USER_IDS` to comma-separated **internal numeric profile IDs**. Empty means all eligible users. Never put these in `NEXT_PUBLIC_*` variables.
7. Enable webhook redelivery/error statistics in LINE Console. Verify raw-body signature rejection and normal-load response times on the deployed environment. Persist failures return non-2xx; 200 is sent only after durable acceptance. Cold-start/DB response time still requires measurement.
8. Monitor oldest queued age, accepted/failed/dead counts, webhook backlog and DB pool pressure before increasing worker count or canary size.

```sh
.venv/bin/python -m scripts.line_worker --metrics
```

This command reads aggregate state without sending. The read-only admin summary also uses complete aggregate counts when durable delivery is enabled.

## Failure and recovery

- 5xx/network timeout: retry the same frozen body/recipient/UUID with exponential backoff+jitter. The first request is frozen before provider I/O. Never replace recipients/text on that request.
- Accepted retry 409: treated as accepted only with the accepted-request header. `sent` means provider accepted, not human delivery/read.
- Other 4xx: terminal; investigate credentials/payload. 429 waits, with a longer wait for monthly-quota errors. A local budget reservation that is denied does not spend a provider attempt.
- Retry window: stop at 23 hours from the recorded first attempt, conservatively inside LINE's 24-hour limit. Uncertain expired requests are never blindly replayed under a new UUID.
- Worker crash: leases expire. Stale workers cannot finalize an outbox row or resolve episode state. A crash after provider acceptance retries the original frozen request/key.
- Webhook linking/unfollow is atomic and timestamp ordered per LINE user. Business projection is durable before any reply; code consumption can be retried with its original saved outcome. Old redeliveries do not reopen a newer unfollow/link state. Expired reply tokens are not converted into push messages.
- Consent, current GPS version, preference revision, selected source and freshness are checked before each delivery. A message already accepted by LINE cannot be recalled.
- Dead rows retain reason/tag but remove frozen bodies and recipient-bearing payloads. There is intentionally no Admin replay button. An authorized server operator must resolve the cause and re-evaluate current eligibility; do not run blanket SQL changing all dead jobs to pending.
- Worker maintenance respects the existing community maintenance switch for outbound processing. Stop producer/consumer processes as the emergency delivery kill switch. Do not toggle back to the legacy consumer while durable leases are active.

## Data/privacy and retention

- Latest GPS and episode state are service-only tables with RLS; the API exposes only the owner's readiness/time/accuracy/version. GPS export is added to owner account export; deleting the profile cascades the new location/state records. Existing account erasure remains a review/request workflow.
- The worker prunes expired GPS and provider budget buckets hourly. Completed webhook bodies/reply text are removed; dedup records are kept for 30 days. Unknown LINE-user cursors are pruned after 30 days when no linked account references them.
- Notification history/outbox archival to a dedicated object store/warehouse is **not enabled automatically**. Terminal records remain in PostgreSQL. Choose a retention period, private archive destination, encryption and verified export/restore procedure before any destructive pruning. Active/pending work must not be deleted by archive jobs.
- Secrets stay on the server. Logs/metrics contain no GPS, LINE IDs, raw provider bodies or tokens.

## Capacity and remaining release gates

The implementation provides durable queues and multi-process coordination; it is not a million-user capacity certification. Shadow results, deployed webhook latency, provider quota, end-to-end outage/load testing, worker hosting and production RLS/advisors must pass before rollout. Bounded spatial candidate queries use indexed public coordinates; evaluate their EXPLAIN plans on representative regional data before changing partitioning or adding sharding. Personalized distances/source times currently use Push; Multicast optimization is deferred until identical eligible payload groups are demonstrated. Broadcast must not bypass preference/area filtering.
