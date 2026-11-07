# Contribution v3 release and operation

The complete policy is in [the v3 specification](../superpowers/specs/2026-11-07-contribution-v3.md). This release preserves the existing ledger, accounts, XP and ranks. **Do not use community reset scripts for this release.** Community Trust release is independent.

## Deployment order

1. Apply `20261107141950_contribution_v3_prerequisites.sql`. It installs dormant v2-compatible foundations only when absent; existing v2 installations are left intact. Both paths are tested against the numeric schema.
2. Apply `20261107142025_contribution_v3.sql`. It adds the separate release control, policy-at-submission trigger, transactional worker safeguards, all-version monthly views after cutover and compensated dependent bonuses. Default: disabled, no start timestamp, missions disabled.
3. Apply `20261107143805_contribution_v3_service_evidence.sql` to keep v3 mission evidence aligned with the request-service protocol (v2 OCR field/unit gates remain unchanged).
4. Deploy matching Python/TypeScript/UI contracts. Keep `CONTRIBUTION_V3_ENABLED=false` until release evidence is complete.
5. Compare account and ledger fingerprints, balances/ranks and report/Trust counts before/after. No new reward/backfill should exist from migration alone.
6. Run the isolated SQL tests and the PostgreSQL 17 CI matrix (existing/missing v2). Run mobile/browser checks and physical-device validation separately.

## Enable only with real evidence

The target start is **December 1, 2026, 00:00 Asia/Bangkok**. The target is not automatically scheduled by migration/deployment. Physical iOS/Android help-request, camera/gallery and location-permission checks are still required, as is real coverage input evaluation before mission bonuses. Do not put a fabricated reference in a release gate.

The authorized operator prepares a server-side JSON file with `notice_ref`, `concurrency_ref`, `preservation_ref`, `device_validation_ref`; add `coverage_validation_ref` only after coverage validation is complete. Set the app flag true, then use the configured server environment:

```sh
.venv/bin/python -m scripts.contribution_v3_ops status
.venv/bin/python -m scripts.contribution_v3_ops release \
  --start 2026-12-01T00:00:00+07:00 --refs reviewed-xp-release.json --operator project-owner
# Add --missions only with actual coverage-validation evidence.
```

The scheduled setter rejects missing evidence, moving a previously fixed start and an initial date outside a future Thai month boundary. An explicitly authorized immediate launch instead uses `--now --release-reason`, with the initial timestamp assigned by the server and the reason retained in the release audit. Evidence gates remain required. UI can announce the scheduled date once the control exists and the app flag is on. Before that date, old policies continue. At/after cutover the job's version remains fixed even across retries/rollback.

## Reconciliation and rollback

Existing protected XP cron runs the worker, dependency compensation and monthly season freeze. The v3 flag controls the additional app maintenance path. Manual bounded retries are safe:

```sh
.venv/bin/python -m scripts.contribution_v3_ops reconcile
.venv/bin/python -m scripts.contribution_v3_ops release \
  --pause --start 2026-12-01T00:00:00+07:00 --refs reviewed-xp-release.json --operator project-owner
```

Pause leaves v3 jobs pending; it does not reclassify them as legacy or delete ledger events. Keep the app flag on while paused so owners see the paused state. Resume with the same timestamp/reference file, without `--pause`.

A confirmed erroneous grant can be compensated through the authorized server process only:

```sh
.venv/bin/python -m scripts.contribution_v3_ops reverse \
  --event XPE-000123 --reason 'Confirmed duplicate grant; finding reference CASE-123' --operator accountable-operator
```

There is no score-edit argument or Admin write endpoint. Review the evidence first. OCR/system mismatch alone is not automatic user misconduct. Compensation is idempotent and keeps original policy/occurrence, recomputes dependent day/week bonuses and frozen-season revisions, and leaves consumed quota intact. Use live ledger queries to inspect totals; totals are derived, not a separately editable balance.

## Monitoring

Check pending jobs, zero-award reasons, service/pair limits, retries, season revisions and the share of service awards going to actual coverage gaps. Review whether quotas suppress legitimate help or encourage duplicate submissions. Changes to parameters need a new version/notice rather than a silent recalculation of historical base awards.

A normal day can earn 70 XP; weekly-bonus day 90. Historical v1's 65 XP cap excludes the later +5 first-day bonus. Ranks remain 0/100/500/1500/5000, lifetime XP alone. A published report can legitimately receive no XP; pending computation must stay pending, not be presented as zero.

## Owner-authorized immediate release

The owner chose immediate activation after mobile acceptance on November 7. See [live-release evidence](../verification/2026-11-07-xp-v3-live-release.md). Apply `20261107161748_contribution_v3_immediate_release.sql` before using:

```sh
.venv/bin/python -m scripts.contribution_v3_ops release \
  --now --release-reason 'Owner requests immediate launch after mobile acceptance' \
  --refs reviewed-xp-release.json --operator project-owner --missions
```

The command cannot backdate a launch. Retrying immediate mode reuses the fixed start, including pause/resume. The transition month includes actual prior-version awards without creating retrospective XP.
