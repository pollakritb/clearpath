# Community Trust release audit — November 7, 2026

## Scope and confirmed fixes

Reviewed the new Community Trust ledger replay, API contracts, eligibility/reaction flows, review intake/tracking and public/private presentation. Ran the repository's broader backend, frontend, database and mobile regression checks. This is not a claim that every possible production state or physical device has been audited.

- **P2 — stale review responses:** An earlier review-list request could complete after the post-submission refresh and replace the latest result. The UI now commits only the newest request's result/error/loading state and disables manual refresh while loading. A controlled out-of-order response test verifies the newly submitted request remains visible.
- **P2 — ambiguous review tracking:** Pending/reviewed entries had no scope or original message, making multiple requests hard to distinguish. The list now displays the returned date range and request text.
- **P2 — malformed report references:** The review model accepted arbitrary report strings, deferring invalid/wrong-entity IDs to the data service. It now uses the project's ReportID contract, normalizes numeric codes and rejects malformed or wrong-entity references at validation.
- **P2 — internal cache fields on fallback paths:** Failed projection writes and upstream errors could return private cache metadata from the service layer. Existing typed HTTP responses already filtered fields; the fallback service result now also passes through the explicit public contract. Tests exercise both failed writes and write conflicts and verify no private slot/account data or comparison diagnostics escape.

## Verification

| Check                               | Result                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Backend suite                       | 566 passed; coverage 81.68%, above 80% gate                                                                                            |
| Frontend unit suite                 | 382 passed across 83 files; function coverage 90.75%                                                                                   |
| Mobile Chromium regression          | 226 passed; 6 intentional viewport skips; 320/360/390/430px                                                                            |
| Accessibility and interactions      | Existing axe serious-violation checks, 44px navigation targets, keyboard and synthesized touch sheet gestures pass in the mobile suite |
| Production build                    | Passes as part of the browser regression web server setup                                                                              |
| TypeScript / ESLint / Prettier      | Pass                                                                                                                                   |
| Ruff format / lint                  | Pass                                                                                                                                   |
| npm dependency audit                | No high/critical vulnerabilities                                                                                                       |
| Python dependency audit / integrity | No known vulnerabilities; no broken requirements                                                                                       |
| Database regression                 | Grid, external feeds, XP, identifiers and numeric cutover suites pass                                                                  |
| Targeted UI source detector         | No findings in CommunityTrustCard, its form stylesheet or ReportEngagement                                                             |
| Visual inspection                   | Reviewed report at 390px and owner profile at 320px from the regression artifacts                                                      |

Database transaction/concurrency acceptance also runs on PostgreSQL 17 in CI for this backend change. No database schema migration or production vote creation is required for these fixes. The independent audit Trust, Community Trust, XP/rank and IDW remain separate.

## Remaining practical limits

Browser emulation and synthesized touch do not establish GPS accuracy, iOS Safari behavior or physical-device accessibility. Real iPhone/Android location/permission checks and ongoing community-policy evaluation remain operational follow-up. Source-detector output is not a full visual or accessibility certification. The existing independent reporter audit has its own trial state; general availability of Community Trust does not change that separate feature's status.
