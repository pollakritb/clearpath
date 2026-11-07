# Community Trust v1: policy, operations and rollout

## Approved policy

The owner approved general availability (November 7, 2026), with the ClearPath project owner (Pollakrit) responsible for review requests received through Profile → Trust ชุมชน → ขอทบทวน. The Admin operations queue is read-only. Findings are recorded only with the server CLI and evidence/actor/reason references. Reaction/event retention is **365 days**, agreed in this implementation session. No raw voter GPS is persisted.

Participation continuity counts distinct server submission days in Asia/Bangkok over the last 30 calendar days, excluding confirmed identical image hashes; it never enters Trust.

These parameters are experimental product policy: 90 Thai calendar days including today, daily weight `min(n,3)`, minimum 3 voter accounts / 3 reports / 3 days, one latest eligible assessment per voter/reporter/day and 3 admitted days per pair in 30 Thai calendar days. They are not scientific accuracy thresholds. GPS checks proximity, not sensor ownership or immunity to spoofing.

## Separation and consent

Community opinion is separate from independent reporter audits, evidence quality, contribution days, XP, ranks and leaderboards. No approval, rejection, IDW, gap-fill or voter-power changes are made. Existing reactions/audits are not backfilled. Only a new submission acknowledging `community-trust-v1` enters the ledger. Its first accepted Trust reaction day remains fixed across edits/withdrawals. Earlier social reaction timestamps are not imported as Trust history.

The Trust feature is generally available without a trial badge. Its policy parameters remain subject to evaluation; general availability is not a claim of completed physical-device or real-community validation. Positive means confidence from the report's evidence/context; negative means a question about that evidence/context, never a finding of fraud. OCR/system-only issues and station disagreement do not count negatively. Invalid GPS, unavailable evidence and expired reports do not change an existing valid reaction. Pair-denied and non-Trust reason reactions remain social reactions.

## Formula and replay

For each Thai calendar day, `V=100*positive/(positive+negative)` and `w=min(positive+negative,3)`. Calculate `sum(w*V)/sum(w)` at full precision; round to one decimal for display only. No data or insufficient support yields `score=null`. Valid all-negative support can yield zero. If support expires below minimum, return insufficient without a penalty.

The SQL transaction serializes each reporter's writes with a transaction advisory lock and independently validates report status/age, evidence availability attested by the server, GPS fix age/accuracy/proximity and ownership. Private per-report tombstones preserve the first day. Pair-day admissions persist even after withdrawal. Rejected pair days never auto-admit later. Same request UUID/account retries return the original decision. A changed intent under the same UUID is rejected. Withdrawal never requires GPS and does not restore an older report's vote.

The Python pure replay is the only formula for read APIs, profile/report/stack presentation and reconciliation. A snapshot watermark and compare-and-swap projection prevent stale workers overwriting newer events. Failed projections return updating/unavailable and retain a dated previous projection where possible. Daily aggregates and projections can be rebuilt from the ledger.

At 10 eligible voter accounts for a reporter within 3 minutes, hold the cohort for 30 minutes symmetrically. New events while that hold is active share its original deadline. Each individual event is paused once; later waves cannot extend its deadline. Withdrawal during a hold remains withdrawn at release. Suspicion alone does not invalidate a vote.

## Review and removals

Owners submit a report reference or date range. The owner can track pending/reviewed status and a recorded reason. Admin reads the queue without a mutation API. The authorized operator resolves a request privately:

```sh
.venv/bin/python -m scripts.community_trust_ops review-scope --id REQUEST_UUID
.venv/bin/python -m scripts.community_trust_ops finding --user ACCOUNT_CODE --key REQUEST_UUID --file reviewed-finding.json
.venv/bin/python -m scripts.community_trust_ops inspect --user ACCOUNT_CODE
```

A finding file contains `target_sequences`, `outcome` (`valid`, `invalid`, `unresolved`), `evidence_ref`, `operator_ref`, `reason`, and optional `review_id`. No score field exists. Invalidating an event replays remaining events; unresolved findings leave the existing determination unchanged. Removing a report for a system fault requires findings excluding feedback caused by that fault, not an automatic penalty. A privacy deletion remains the project's existing pending retention/identity-review workflow; this feature does not automatically delete accounts or scores. Do not delete linked report/profile rows outside that workflow.

## Retention and monitoring

An independent database cron runs retention at most once per day, including after collection is switched off after a retention policy reference is configured. Events/reaction tombstones and associated new-policy social reactions beyond 365 days are removed without changing the 90-day score. Expired pair admissions/holds are cleared; reviewed requests are removed after retention, pending requests remain actionable. Only counts of purged rows are logged. Keep backups and their expiry under the project's privacy process; application retention does not silently purge external backups.

Review the queue regularly, record findings with reasons, monitor projection retries and held-event release, and evaluate new users, small communities, popular reports and coordinated waves. Compare capped daily weighting with raw and equal-daily averages via the private `inspect` output. Reassess 90/3/3-day/500m parameters after the trial rather than presenting them as validated science.

## Rollout and rollback

1. Apply the additive migration with flags off; verify RLS/RPC privileges and no old-data import.
2. Run formula, ledger, concurrent PostgreSQL and API/privacy/UI tests against isolated data. Record source/commit evidence; do not substitute browser GPS for physical-device validation.
3. Register a real notice, reviewer/channel, retention policy and experiment/privacy/concurrency evidence references in the release control. Set `COMMUNITY_TRUST_COLLECTION_ENABLED=true`, with public flag false for shadow collection. UI explains new vote semantics.
4. Inspect shadow/replay results, then set DB stage public and `COMMUNITY_TRUST_PUBLIC_ENABLED=true` together with this frontend/backend release. No reset of XP, ranks or leaderboard.
5. Configure a protected server schedule for `/api/cron/community-trust` every 5 minutes. The scheduled endpoint persists a compare-and-swap cursor and visits all subjects in bounded batches; manual runs can follow `next_cursor` until null. Retry jobs are safe; held votes also release on a subsequent read without waiting for the cron.

```sh
.venv/bin/python -m scripts.community_trust_ops release --stage shadow --refs reviewed-release.json --operator project-owner
.venv/bin/python -m scripts.community_trust_ops reconcile
.venv/bin/python -m scripts.community_trust_ops release --stage public --refs reviewed-release.json --operator project-owner
# Rollback preserves current social reactions and the ledger:
.venv/bin/python -m scripts.community_trust_ops release --stage off --refs reviewed-release.json --operator project-owner
```

Both Community Trust feature flags default false for a new installation; production is enabled. The superseded `REPORTER_TRUST_ENABLED` flag and independent-score runtime have been removed. A public release fails closed without the recorded operational references. Migration and local tests alone do not establish physical GPS accuracy, unique humans per account, scientific calibration or a completed real-world trial. Record any outstanding acceptance honestly before activation.
