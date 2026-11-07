# Contribution v3 recheck and bug audit

## Scope and fixes

This audit follows the v3 implementation and checks policy transitions, service eligibility, ledger explanations, account isolation, privacy and mobile reporting. XP remains independent of Community Trust, publication and IDW.

| Finding                                                             | Impact                                                               | Fix                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Open missions could mix v2 and v3                                   | Advertised work could be unrewardable after cutover                  | Filter by effective policy; retire old open missions when publishing the new policy        |
| Completed mission after service quota was exhausted used `no_claim` | Incorrect explanation for zero service XP                            | Record `help_limit` without creating extra XP                                              |
| Coverage bonuses counted as helped requests                         | Inflated request statistics and achievements                         | Exclude mission awards from request counts; retain shared quota and lifetime points        |
| XP result survived report changes                                   | Old response could appear on another report                          | Reset by report identity and show pending when no initial result exists                    |
| Reporting context supported only v2                                 | v3 could not submit outdoor context or collect automatic service GPS | Support both versions and collect fresh optional bonus GPS without requiring a prior claim |
| Draft/photo/OCR state survived account changes                      | Prior account state could remain visible                             | Reset the form by authenticated account identity                                           |
| Rejected reports without XP jobs remained pending                   | Misleading indefinite XP calculation                                 | Return not-eligible and omit XP success/pending UI for rejected submissions                |

## Verification

- Backend: 586 tests pass; coverage 81.67% (80% gate).
- Frontend: 390 tests pass across 83 files; function coverage 90.75%.
- Mobile Chromium: 234 tests pass / 6 intentional viewport skips across 320/360/390/430px.
- Ruff, Prettier, ESLint and TypeScript checks pass. The browser suite builds the production frontend before running.
- Dependency audit: no high or critical vulnerabilities under the project audit policy.
- PGlite numeric-schema v3, legacy XP/reset and v2 SQL suites pass.
- Actual PostgreSQL 17: [legacy foundation](https://github.com/pollakritb/clearpath/actions/runs/42387270282/job/128447198156) and [existing v2 foundation](https://github.com/pollakritb/clearpath/actions/runs/42387270282/job/128447198340) pass, including transaction/concurrency acceptance. [Trust concurrency](https://github.com/pollakritb/clearpath/actions/runs/42387270337/job/128447198270) passes independently.
- Reviewed the 320px and 390px v3 submission result screenshots. Browser mocks verify the request contract and layout; they do not establish physical-device GPS accuracy.

The first browser run found an exact-label test locator mismatch and a page-setup timeout. The select is accessible as a named combobox; the test now uses its role. The complete suite was rerun rather than treating the failed run as passing evidence.

## Production database receipt

Additive migration `20261107151303_contribution_v3_audit_fixes.sql` passed PostgreSQL CI before production application. Ledger/account fingerprints were compared inside the migration transaction and remained unchanged. Production retained **15 XP events, 115 total live XP, 6 XP accounts, 11 reports and 0 Trust events**. Browser roles cannot release the policy or reverse XP; control/audit tables retain RLS.

V3 remains **disabled**, with **no scheduled start** and **missions disabled**. Existing XP continues unchanged. No synthetic production points or votes were created. Real-device camera/GPS/help flow checks and real coverage-policy evaluation remain release gates from the original specification. These have not been substituted with browser simulation.
