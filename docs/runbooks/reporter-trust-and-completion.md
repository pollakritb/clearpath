> **Retired November 7, 2026:** this historical runbook describes removed reporter-score and v2 activation commands. Do not execute them. Current operations use [Community Trust](community-trust-v1.md) and [XP v3](contribution-v3.md). Stored audit history remains under the existing privacy/retention process.

# Reporter Trust and completion verification

This runbook operates the local implementation documented in the [execution record](../verification/2026-11-06-completion-execution.md).
Production remains on the existing release until a separate deployment and policy activation are performed.

## Baseline and rehearsal

1. Use a clean source checkout and save the exact commit. Keep private artifacts outside the repository, with restricted access.
2. Run `python scripts/completion_status.py --origin https://clearpath-gray.vercel.app --output /private/path/baseline.json`. The output path must be new; output includes only whitelisted public status fields.
3. Save private existing point totals with `python scripts/community_v2_release.py baseline --output /private/path/point-totals.json`. This reads hosted data and must use the intended project credentials.
4. Restore a production backup into a separate approved project. Record source/target references privately, backup timestamp, restored row counts, FK consistency, totals and test signed-image access. Do not restore over production.
5. Apply additive migrations `20261106100000_reporter_trust_audits.sql` then `20261106101000_account_privacy_requests.sql` on staging. Verify roles/RLS plus the existing v2 schema, server RPC ownership and identifier aliases. The migrations do not activate policy or rewrite XP.
6. Run local SQL rehearsals with `node scripts/test-reporter-trust.mjs`, `node scripts/test-community-v2.mjs` and `node scripts/test-registered-measurements.mjs`. Separately run hosted staging races using multiple actual connections: same audit replay, competing revisions, stale review versus new revision, two-slot cap and five-request/one-bonus reconciliation.

## Independent reporter audit protocol

Before collecting scored cases, reviewers must agree the rubric, sampling frame and conflicts-of-interest process. The reporter cannot be their own independent evaluator.
Inspect source evidence under controlled access. Use `pass` only when the declared reporting rubric is met, `problem` only for an established reporting defect, and `unresolved` when evidence is insufficient.
Use `fault_domain=reporting` only for a reporting result; `device`, `system` and `unknown` are excluded from personal Trust.
Air4Thai/CAMS disagreement, OCR success, likes and claimed device calibration alone cannot establish a reporting outcome.

Maintain JSONL rows with:

```json
{
  "audit_key": "unique-event-key",
  "case_key": "immutable-case-key",
  "sample_key": "shared-measurement-key",
  "user_id": "USR-000001",
  "report_id": "RPT-000001",
  "revision": 1,
  "outcome": "unresolved",
  "fault_domain": "unknown",
  "evaluator_key": "independent-reviewer-key",
  "evidence_ref": "private-protocol-and-source-reference",
  "evaluated_at": "2026-11-06T00:00:00+00:00"
}
```

The example is a schema illustration, not a real audit. Resolve actual identifiers from staging/production; never import this example.
`sample_key` must group correlated observations. Record independence, review selection, disagreement/adjudication and device limitations in the private evaluation artifact.

- Validate only: `python scripts/reporter_trust.py import /private/path/audits.jsonl`.
- Compare candidate priors: `python scripts/reporter_trust.py sensitivity /private/path/audits.jsonl`. The result is a computation, not validation of the sampling or rubric.
- Explicit ingestion: the same import command with `--apply`, only after evaluating the intended project and authorized audit data. No Admin dashboard edits audit outcomes.
- Pending reviews can be read by the server operator from private `community_reporter_review_requests`. Obtain a new independent case revision; importing it closes pending reviews of earlier revisions. No direct score override is available.

## Physical device and real delivery evidence

For each physical iPhone/Android session record model, OS, browser, app build, date, tester consent, steps, expected/actual result and redacted captures.
Test camera deny/cancel/retake, location deny/timeout/inaccurate/retry, keyboard overlap, rotated viewport, resume from background, large text and VoiceOver/TalkBack focus/labels.
For voting, log only controlled test positions and accuracy, test inside/outside/uncertain 500 m boundary plus old fix/self-vote/repeated vote. Browser emulation cannot prove GPS accuracy or anti-spoofing.
For LINE, use consenting test recipients: linked/unlinked/wrong account, expiry, quiet hours, closed website, five overlapping requests, one inbox event per recipient, retry/replay and delivery failure recovery. Keep receipt IDs privately; no raw GPS or access tokens in shared evidence.

## Privacy acceptance

Export currently provides selected structured activity, not a complete legal subject-access package or image archive.
Owner-confirmed account closure is implemented with durable retry and limited retention; see [account closure](account-closure.md) for the exact scope, completion checks and restore procedure.
The hosted functions remain gated by `ACCOUNT_PRIVACY_ENABLED`; enable only after the account-closure migration and integration verification.

## Activation and rollback

Copy `docs/verification/completion-readiness.example.json` outside the repo. Reference the reviewed **clean commit**, real evidence artifacts, SHA-256, aware timestamps and reviewers.
`python scripts/completion_gate.py /private/path/readiness.json` must pass after actual review.
Prepare `REPORTER_TRUST_ENABLED`, its independent validation reference, v2 runtime configuration and DB schema on every worker. A validation-reference string alone does not prove validation; the manifest supplies the reviewed artifacts.
Activation CLI `python scripts/community_v2_release.py activate --apply --threshold <evaluated-report-evidence-threshold> --evaluation-ref <artifact-reference> --readiness-manifest /private/path/readiness.json` rejects missing evidence, wrong commit, dirty checkout, demo runtime or missing runtime prerequisites.
The evaluated threshold applies to report evidence for gap-fill, not personal Trust.
Record the T0 response, compare old totals, current monthly events and replay/reconciliation. Observe collectors, readiness and outbox over actual scheduler cycles.
Rollback uses the existing release CLI and flags. Do not delete audit/XP ledgers or erase published reports to perform rollback. Independently verify source/worker/policy versions and replay behaviour after rollback.
