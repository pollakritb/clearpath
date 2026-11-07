# Community Trust v1 acceptance record

The project owner authorized experimental public activation and accepted responsibility for review requests, with reaction/event retention of 365 days. Operational details and rollback commands are in [the runbook](community-trust-v1.md).

## Automated evidence

- Backend: 564 tests pass, including formula, replay, eligibility, privacy, review validation and worker failure recovery.
- Frontend: 381 unit tests pass (function coverage 90.75%). TypeScript, lint, formatting and production build pass.
- Mobile: broad regression run passed 222 cases with 6 intentional viewport skips. The final Trust/report and owner-review flows pass at 320, 360, 390 and 430 px, including retry identity, evidence availability, non-Trust reasons and review-list refresh.
- Real PostgreSQL 17 concurrency checks pass: [GitHub Actions](https://github.com/pollakritb/clearpath/actions/runs/42373461996/job/128406158084). Tests cover simultaneous retries, pair-day contention, wave holds and projection compare-and-swap.
- SQL replay/lifecycle tests cover quota persistence, withdrawal without fallback, hold release, service-only privileges, rollback preservation and retention cleanup.
- Existing reactions and independent audit results are not imported. Production release/control events are the authoritative record of activation times and policy references.

## Synthetic policy comparison

Reproduce using `python -m scripts.evaluate_community_trust`. These are artificial scenarios, not observations from real community participants.

| Scenario                                                     |  Capped daily Trust | Raw positive ratio | Equal daily average |
| ------------------------------------------------------------ | ------------------: | -----------------: | ------------------: |
| New account                                                  | null / insufficient |               null |                null |
| Small community                                              |                66.7 |               66.7 |                66.7 |
| 300 positives on one popular day, two separate negative days |                60.0 |               99.3 |                33.3 |
| Negative wave after its hold expires                         |                50.0 |               23.1 |                75.0 |

The comparison demonstrates policy behavior, not scientific correctness or calibrated fraud detection.

## Outstanding field evaluation

Physical-device GPS accuracy and permission behavior still require real iOS/Android checks. Browser geolocation mocks do not establish field accuracy. No real-user trial has been completed by this implementation. Public activation is an explicitly experimental pilot authorized by the owner, rather than evidence that every original public-launch criterion has been met. Scores remain insufficient until enough new eligible accounts, reports and days exist.

The owner should check the review queue daily, inspect projection retries/held votes, and review outcomes after 30 days, especially small communities and coordinated waves. Record evidence before changing policy parameters. Backup expiry and privacy deletion remain managed under the project's privacy process; application retention does not remove external backups.

## Production activation verification

The additive migrations, GPS clock follow-up and protected 5-minute reconciliation schedule were applied. Both collection/public release controls are enabled, with shadow/public audit events. A protected worker call returned HTTP 200 with zero retryable projections. Public member reads returned insufficient/null with no private ledger fields. Owner/Admin/cron endpoints returned 401 without authentication. All private Trust tables have RLS; browser roles cannot invoke release controls. Report/profile counts stayed unchanged and no historical reactions entered the ledger.

During verification just after 13:00 UTC on November 7, Air4Thai still returned readings timestamped 12:00 UTC. The existing sync succeeded, but readiness correctly reported stale station data. No freshness threshold or source timestamp was changed to hide this upstream-data condition. It is independent of Community Trust activation.
