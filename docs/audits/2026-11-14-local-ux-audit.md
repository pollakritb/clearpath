# Local UX and regression audit — 14 November 2026

Scope: all current uncommitted frontend changes, related map/settings/report flows, and the account-closure integration introduced in commit `8312552`. This is a bounded regression audit, not a claim that every historical subsystem or external service is defect-free. The initial audit was local-only. The release recheck below records the subsequently authorized production rollout.

## Findings and corrections

| Severity | Finding / mistake                                                                                                                                                              | Local correction and evidence                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Closed-account write protection also rejected evidence-retention cleanup and derived public reaction counters. An isolated database reproduction failed with `account_closed`. | Added `20261114100322_account_closure_retention_fix.sql`. Existing report identity/content stay frozen; only derived fields and narrowly constrained expired, non-held evidence cleanup are allowed. Database regression checks cover allowed cleanup/counters and rejected identity restoration, PM2.5 edits and held-evidence purge. |
| Medium   | Whole-hour age labels concealed remaining minutes and made the 120-minute color boundary hard to understand.                                                                   | Shared age formatter now displays `1 ชม. 56 นาทีที่แล้ว`, `2 ชม. 0 นาทีที่แล้ว`, `2 ชม. 4 นาทีที่แล้ว`; flooring avoids crossing a boundary early. Invalid ages retain the unknown-time fallback.                                                                                                                                      |
| Medium   | Earlier prototypes changed singleton station appearance/freshness behavior outside the requested grouping scope.                                                               | Restored singleton icon function and rendering block to HEAD exactly, verified after removing whitespace. Tests confirm original AQI color at 116 and 120 minutes and gray at 121.                                                                                                                                                     |
| Medium   | Earlier group prototypes used ranges, verbose old-data labels and current-only values, creating clutter and missing values.                                                    | Groups show one rounded mean of available latest numeric readings, a small count and the clock indicator. No visible old-data text or range. No value is fabricated when every source lacks a valid number; that exceptional group uses ×.                                                                                             |
| Medium   | Rounding the group mean before color classification changed boundary colors: 15.4 became 15 and blue.                                                                          | Classify the raw mean; round only its displayed number. Boundary regression test added. The group mean is a source summary, not an IDW estimate of an area.                                                                                                                                                                            |
| Medium   | Zooming out could swallow the selected station/report into a group while its detail remained open.                                                                             | Exclude selected entries from grouping and retain their original singleton marker. Both source families have regression coverage.                                                                                                                                                                                                      |
| Medium   | A deletion receipt could remain visible after switching to another signed-in account.                                                                                          | Bind receipt to the submitting account; a newly signed-in account sees its own form. Guest after successful sign-out can still see completion. Regression test added.                                                                                                                                                                  |
| Low      | Community group markers inherited an outline-removal rule without their own keyboard focus indicator.                                                                          | Added a visible focus outline specifically for community map groups.                                                                                                                                                                                                                                                                   |
| Low      | Group bounds could chain across distant geography; invalid-only groups could disappear.                                                                                        | Keep zoom-dependent geographic diameter limits and retain an explicit nonnumeric marker when no valid observation exists.                                                                                                                                                                                                              |

## Other local changes reviewed

- Settings labels now describe the actual account-deletion function. No activity-download feature was added back.
- Guest notification/report flows show one relevant sign-in action; the report camera/form mounts only after authentication.
- Station detail separates historical readings from current status and allows metadata to wrap.
- News presentation removes exact duplicated publisher suffixes and exact boilerplate; meaningful text is retained.
- Settings/content panels use opaque surfaces. Glass remains on floating map controls, rather than nested content/form surfaces.
- Station groups and community groups remain separate. Original singleton station and report icon families remain intact. Existing backend community stacks retain their detail behavior.
- No changes to IDW, report approval, Trust, XP, public-coordinate obfuscation, API contracts or Admin/Moderator capabilities were introduced by these UX changes.

## Verification

- Frontend: **533 tests passed across 108 files**.
- Full backend pytest suite passed; existing Starlette/httpx deprecation warning remains.
- Account-erasure isolated database script passed, including the new retention/counter protections and existing owner/isolation/permission checks.
- Format, lint, TypeScript, production build, Ruff checks and Ruff formatting passed.
- Automated axe checks on loaded states of `/`, `/air`, `/community`, `/report`, `/settings`, `/settings/notifications`, `/settings/privacy`: no WCAG A/AA violations reported and no horizontal overflow at 390px. This does not cover every dialog, populated state or assistive-technology interaction.
- Earlier local visual checks covered 320/390/430px and expanding a 12-report community group back to individual markers. Those checks do not substitute for the targeted regression tests above.
- Exact singleton restoration verified against HEAD for both the icon function and rendering block.
- Browser fixture confirmed the station detail displays `2 ชม. 4 นาทีที่แล้ว`; screenshot: `output/playwright/audit-age-2h4m.png`. Fixture removed after checking.
- Release recheck: community-group keyboard focus is browser-verified (`:focus-visible`, solid 3px outline). Screenshot: `output/playwright/release-community-focus.png`; browser fixtures removed afterward.

## Outstanding / limits

1. **Resolved during authorized release:** migration `20261114100322` applied to production project `kmvxwfrmmictzuxbsncr`; exact function body, 16 attached triggers and denied direct execution by anon/authenticated verified. Regression behavior was tested in an isolated database; no hosted user records were used as test fixtures.
2. Live Google OAuth, external Auth/Storage deletion and scheduled production retries were not rerun in this local UX audit. Do not infer production integration health from unit tests.
3. News source selection/relevance and upstream duplicate articles were not redesigned; the current change only cleans presentation.
4. Clock icons cannot replace exact timestamps in detail views. Those timestamps and the new hour/minute labels remain available.
5. Historical prototype screenshots/notes under `output/playwright/` may show abandoned range/current-only designs; this report supersedes them.

## Release recheck — requested 14 November 2026

- Kept the agreed 120-minute singleton station color cutoff unchanged.
- Re-ran 533 frontend tests (108 files); frontend statement coverage 92.53%, line coverage 93.60%.
- Re-ran 3,760 backend tests; backend coverage 80.95% (80% gate passed).
- Production dependency audit: zero vulnerabilities. Migration guard: non-destructive.
- Updated stale browser expectations from prior committed UI changes: account deletion replaces download labels, comment suggestions require opening their disclosure, request detail now expands through its grip, and place-sheet preview reserves up to 64px below the header. No product behavior was changed to satisfy these tests.
- Supabase advisors before deployment: no security/performance ERROR; existing warnings are leaked-password protection disabled and three duplicate indexes. These predate this migration and are outside this UI release.
- Full production-env preflight could not be reproduced locally because Vercel sensitive variables cannot be read back with the available token. Actual deployed health, readiness, security headers and unauthenticated Admin denial passed before deployment. No production environment values were changed.
- Browser recheck found a real regression after tab return: the detail preview covered the overview/locate toolbar. The shared sheet now publishes its measured preview height; map controls sit above that height. Continuity coverage now checks this on all four viewports instead of only 390px.
- The regular browser suite covers request transitions; the optional exhaustive 1,000-path stress sweep is excluded from this release run.
- Final browser regression: **473 passed, 32 intentionally skipped**, across 320/360/390/430px. Separate non-demo guest run: **28 passed**.
- All 12 additional isolated database integration suites passed (CAMS, feeds, community, retention, contribution/XP, identifiers and LINE delivery).
- Deployment verification is recorded separately after rollout.
