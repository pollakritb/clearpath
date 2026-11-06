# Mobile and system audit release — 2026-11-06

This release includes the system audit fixes and subsequent mobile interface refinements. It excludes the separate forecast retirement, persistence extraction, and stylesheet consolidation refactor still being developed locally.

## Changes

- Compact page headers, simpler settings and notification sections, labeled location search with clear/focus recovery, and consistent timeline icons and touch targets.
- Native login dialog focus containment and restoration, stable station freshness as cached observations age, location request race protection, notification pagination, recoverable photo-analysis failures, safer error messages, privacy copy, and reduced-motion support.
- Close the retired public data-issue submission endpoint. Historical records remain readable by authorized administrators; no database records are removed.
- Preserve existing PM2.5, contribution, Trust, geographic voting, publication, and production feature-flag policies. This release does not activate contribution v2 or run database migrations.

## Validation

- Frontend: 326 unit tests passed; lint, format, TypeScript and production build passed.
- Backend: all 610 tests passed, with Ruff format and lint checks passing. Local test execution uses the existing temporary OpenMP runtime required by legacy model-training tests.
- Browser: the initial full run passed 197 cases and skipped 6. Four assertions still used the former settings-link label; one detected the retired submission endpoint. After fixing those issues, all 5 affected cases passed again across the applicable mobile sizes. Thus all 202 runnable cases have passing results.
- Release preview uses a separate backend and production frontend build. It retains the source layout of the deployed application rather than copying the unrelated local refactor.
- Real OAuth, physical camera/GPS behavior, LINE delivery and hosted database concurrency are outside these local browser checks.
