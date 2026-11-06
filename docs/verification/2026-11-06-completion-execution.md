# Completion execution record — 6 November 2026

Local implementation against deployed baseline `71150fb58f471dfa793ffbb77fb99404fa6b6df8`.
This record covers the [approved plan](../superpowers/plans/2026-11-06-completion-and-reporter-trust.md).
Implemented, verified locally, enabled in production and accepted are separate states.
No migration, production flag, audit import, policy activation or deployment was applied in this work.

## Follow-up release preparation

After deploying the separate mobile request fix `50503a9`, the user authorized
handling the remaining work. A coherent foundation release now packages the
refactor, CAMS window fixes and dormant Reporter Trust/privacy code. Code delivery
does not activate the Trust/XP/gap-fill policy bundle or install the new migrations.
The matrix below records the original local implementation; release evidence must
be read alongside it rather than treating all rows as production accepted.

Follow-up local checks: **504 backend tests**, **81.76% backend coverage**,
**334 frontend tests**, with frontend lines **93.81%**, statements **92.75%**,
functions **90.33%**, branches **86.70%**. SQL rehearsals cover grid, XP, v2,
registered requests, readable/numeric identifiers and new private audit/privacy tables.

The CAMS collector now anchors requests to the immutable job creation hour, not
the six-hour scheduler slot. A read-only upstream probe returned 120 timestamps
but only 110 non-null values at one coordinate; the actual value horizon was
about 108 hours at that observation. No new production generation or nationwide
coverage is inferred from this single-location probe.

Staging/production credentials are absent from the local demo environment. Hosted
migration, concurrent database rehearsal, Auth erasure and independent scoring
acceptance therefore remain pending. Real LINE/device/restore evidence is not
replaced with local fixtures. Reporter Trust and account privacy retain default
`false` flags, and no real account deletion or message delivery is performed.

## Feature and delivery matrix

| Area                   | Local work and evidence                                                                                                                                                                             | State and remaining work                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 baseline            | `scripts/completion_status.py` captures release, readiness, CAMS generation/horizon, month activation and source state; private files use mode 0600 and refuse overwrite                            | Public production baseline captured. Hosted schema versions, scheduler/worker configuration and private XP totals still need a reviewed release baseline                                                          |
| P0 source separation   | Pre-task file hashes and patch saved before changes; prior deployed worktree retained separately                                                                                                    | Existing persistence/CSS/legacy pipeline refactor is preserved. New work has not been committed or merged into a release                                                                                          |
| P1 CAMS                | Current-hour 120-slot collection; grid chunks share one UTC anchor; partial/all-null provider tail is not advertised as available; pure horizon summary and actual end/time-count UI                | Verified local. Recollect and observe a new production generation before claiming live coverage. Upstream can return less than 120 future hours                                                                   |
| P1 station health      | Existing readiness, sync runs, stale rules and source attribution retained                                                                                                                          | Production baseline contains stale stations. Root cause, repeated cron execution, source/run alignment and alert delivery are not yet certified                                                                   |
| P2 reporter Trust      | Separate immutable independent-audit ledger, versioned Beta(2,2) projection, grouped sample dedup, latest revisions, null/new-user state and excluded device/system faults                          | Verified local. Rubric, real sampling and prior sensitivity remain candidate until independent evidence is accepted                                                                                               |
| P2 private review      | Owner-only history and recent-login request; no private evidence/evaluator/sample keys in owner/public API; request does not edit score; importing a newer independent result closes the old review | Verified local Python and SQL. Independent review team/process and real turnaround still need operational acceptance                                                                                              |
| P2 presentation        | Current account Trust on profile and consenting report authors; no cluster average or anonymous-account linkage; sample counts and candidate label shown                                            | Component checks and browser review; no new production score is synthesized from old OCR approvals                                                                                                                |
| P3 XP and ranking      | Existing +10/+5/+5/+20 ledger, Thai calendar month, shared ranks and preserved legacy totals retained                                                                                               | Local SQL regression passed. New season activation, hosted multi-connection races and before/after totals require staging evidence                                                                                |
| P3 gap-fill            | Personal Trust is not an input or multiplier. Existing v2 report-evidence/corroboration policy remains gated; Place IDW stays distance-only                                                         | No production threshold changed. Independent gap-fill evaluation required before activating bundle                                                                                                                |
| P4 requests and votes  | Existing two-place registration, five-request result fanout and one bonus checked in SQL; existing geofence/privacy/replay regression retained                                                      | Local evidence only. Real GPS edge and consented end-to-end notification fanout remain pending. 500 m is interim product policy                                                                                   |
| P5 mobile UX           | New Trust explanations/review and privacy settings follow the existing single-frame design; 320/390/430 px captures, component checks and existing mobile suite                                     | Browser emulation is separate from physical iPhone/Android, camera/GPS, VoiceOver/TalkBack and background tests                                                                                                   |
| P6 delivery            | Existing outbox/replay/inbox tests retained                                                                                                                                                         | No real LINE messages sent. Consented delivery receipts, quiet-hours, account mismatch and operational recovery remain pending                                                                                    |
| P7 privacy             | Recent authenticated login required; owner-only paginated structured activity export; no partial download/account-switch leak; idempotent deletion-request queue                                    | Export does not include media binaries or all retained audit data. Account erasure is **not implemented**: no Auth deletion, media purge or completed-erasure claim. Retention and restore decisions needed first |
| P7 security/operations | New tables are private RLS, server SELECT-only, mutations through constrained server RPCs; no Admin mutation route; baseline files private                                                          | Hosted permissions, isolated backup/restore, load/alert drills and accountable ownership still pending                                                                                                            |
| P8 refactor/docs       | Existing local refactor retained; new API/Pydantic/TS contracts aligned; verification record and operator runbook added                                                                             | Source-wide regression run locally. Refactor remains undeployed; ERD/data dictionary and final deployed inventory must be reconciled at release                                                                   |
| P9 rollout             | Activation CLI requires independent evidence, real runtime flags, validation reference, clean reviewed commit and artifact hashes before server RPC                                                 | No production activation performed. Staging, pilot acceptance and post-release observations required                                                                                                              |

## Reporter Trust policy in this implementation

`Trust = 100 × (passed + 2) / (passed + problems + 4)` for at least one concluded independent sample.
With no concluded sample, `score = null`; the UI says there is insufficient independent history.
Beta(2,2) is a candidate design prior, not a validated probability that PM2.5 is correct.

- Input records must identify the case, shared sample, subject/report, evaluator, evidence reference, outcome, fault domain, time and revision.
- An immutable case retains its subject, report and shared sample across revisions. Replay of the exact payload is safe; conflicting replay is rejected.
- Only the newest case revision participates. Checks sharing a sample count once, conservatively preferring problem then unresolved then pass.
- Device, system and unknown fault domains do not lower reporter Trust. OCR approval, Like/Dislike, XP and inactivity are not inputs.
- A review request is a queue item. Only a newly imported independent audit revision can change the derived score.
- Anonymous reports do not trigger a lookup or expose account Trust. Public member profiles retain their existing visibility checks.

Candidate local mode is available without real results. Hosted `REPORTER_TRUST_ENABLED=true` without `REPORTER_TRUST_VALIDATION_REF` fails closed as unavailable.
Legacy report fields remain for compatibility, with `legacy_report_score` explicit; they are not renamed into personal Trust.

## Local verification artifacts

Latest full run: backend **501 passed**, coverage **81.76%** (80% gate passed); frontend **333 passed** across 71 files; existing browser suite **202 passed / 6 skipped**, at 320/360/390/430 px. Normal production and isolated proxy builds passed. Skips remain skips, not accepted device or hosted evidence.

The six skips are intentional viewport scoping in the existing suite: map continuity runs at 390 px only; 200% text reflow runs at 320 px only. Those two checks passed at their designated widths. New privacy and Trust panels were also inspected at 320/390/430 px without horizontal overflow; scoped axe A/AA checks found zero violations. This is not full WCAG certification.

The saved production baseline at 07:49 UTC observed release `71150fb`, 177 stations (148 fresh / 29 expired), generation `CGN-000014` with 113 current/future hourly slots and about 111.2 hours remaining, and monthly v2 `launched_at=null`. This supersedes the earlier single observation in the plan for that timestamp only; these are changing observations, not permanent totals.

On the long-running development server, newly added settings routing initially showed stale server/client markup. Restarting that local development process resolved it; fresh navigation and isolated production-build browser regression passed. No production hydration defect is inferred from that stale dev process.

Artifacts are under ignored `output/completion-2026-11-06/`; they are not production evidence.

- `backend-coverage.log`, `backend-junit.xml`, `coverage.xml`: full backend regression and coverage.
- `frontend-tests-final.log`: full component/unit regression.
- `build.log`, `build-local-proxy.log`: normal production build and isolated local proxy build.
- `registered-db.log`, `contribution-db.log`, `reporter-db.log`: local PGlite SQL checks; not hosted multi-connection evidence.
- `browser-tests.log`, `browser-results.json`: existing mobile browser regression against an isolated local backend.
- Screenshots: `output/playwright/system-audit-2026-11-06/privacy-{320,390,430}.png`.
- `production-baseline.json`: public read-only observation; do not interpret this as successful application of new code.

## Outstanding acceptance gates

The example manifest `completion-readiness.example.json` intentionally fails validation.
Fill a separate private manifest with real artifacts, dates, reviewers and hashes; never relabel fixtures as real evidence.
Required categories: staging migration, independent Trust evaluation, gap-fill evaluation, iPhone, Android, GPS boundary, LINE delivery, registered request fanout, restore drill, privacy retention, provider licences and pilot acceptance.

The accompanying [runbook](../runbooks/reporter-trust-and-completion.md) defines collection and operator steps.
The full P0–P9 plan is **not complete or production accepted** while these remain outstanding.
