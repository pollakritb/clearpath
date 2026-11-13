# Mobile platform flow audit

Scope: one shared 320–430px mobile UI, local demo data and isolated test backend.
The audit exercises navigation, input validation, retry, close/back, focus, loading,
empty/error states, text enlargement, accessibility and touch interactions.
It does not claim every possible state or external provider has been exercised.

## Coverage map

| Surface              | Paths and actions exercised                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map                  | Search, recent places, clear/remove history, result selection, profile, layers, station list/sort/selection, GPS success/denial/late callback, map continuity across tabs          |
| Air and forecast     | Refresh, station details, full/compact sheets, observation history, forecast time controls, missing/stale data, API retry, tables and source distinctions                          |
| Reports              | Camera readiness/switch/cancel/retake, OCR success/unreadable/retry, draft retention, submission and validation; fake camera frames in browser tests                               |
| Community            | Group/individual pins, photo viewer, archived/missing links, reactions, comments, community Trust, leaderboards and member return paths                                            |
| Measurement requests | Search/map/form navigation, scheduling, submit/retry, cancellation/keep, history/detail/map links, help reporting/decline and terminal states; separate 1,000-path generated sweep |
| Helper areas         | Introduction choices, reminders, edit/create/delete, consent switches, GPS and centered selection, no radius/map pins, save retry and actual local backend contract                |
| Account and settings | Entry-specific return links, nested settings, reload, browser Back/Forward, participation tabs, notification conditions, LINE UI, privacy/export, auth error handling              |
| Admin                | Read-only sections, report/OCR details, announcements, operations/audit, download and refresh, exits back to originating page; mutation controls remain unavailable                |
| Guest                | Login gating, dismiss/Escape/focus restoration, account menu without admin links, exit from login to settings and back; no real OAuth or message delivery                          |
| Shared               | Mobile navigation, 44px targets, 200% text, forced contrast, focus restoration, service worker/offline fallback                                                                    |

## Fixes from this audit

- Station list now owns its view: map chrome, request launch button and selected
  map sheets cannot intercept its Back, sort or station controls. Opening the list
  focuses its Back action.
- Member and admin links carry an explicit internal `returnTo`; exits use that
  origin after reload. Member's Back and header Close agree. A direct member entry
  keeps its leaderboard fallback.
- Request list/detail and public member load failures offer immediate retry.
  Request responses are sequenced so an older response cannot overwrite a later
  load, or the view after navigation.
- Returning from help reporting to request status replaces the reporting entry,
  so Back can unwind to the request list instead of cycling through reporting.
  Failed request context loads offer retry; guests see a login explanation.
- Shared sign-out buttons show pending/error state, block duplicate clicks and
  permit a failed sign-out to be retried. Admin mobile styling keeps this control
  visible.
- Updated regression expectations for the locally redesigned search bar and
  explicit settings origin URLs; search has no obsolete sheet-drag control.

## Evidence

Browser specs live in `e2e/`, including `platform-flow-recovery.spec.ts`,
`settings-return.spec.ts`, `guest-flow.spec.ts` (opt-in non-demo build),
`helper-area-backend.spec.ts` (opt-in isolated backend) and
`request-thousand-paths.spec.ts`. Authentication provider failure handling also has
isolated unit tests; the suite must not send OAuth requests, real LINE messages,
production reports or notifications.

A local demo session verifies signed-in UI behavior; it is not a real Google
OAuth session. Camera tests use Chromium fake-device frames. Real iOS Safari,
physical camera permissions, Google OAuth completion and LINE delivery remain
manual integration checks. No production data is mutated by this audit.

## Verification results — 13 November 2026

- Full signed-in/demo mobile browser suite: **462 passed**, 6 intentionally
  skipped viewport duplicates. Map continuity runs at 390px; the full 200% text
  sweep runs at 320px. Other feature flows run at 320, 360, 390 and 430px.
- Non-demo signed-out browser suite: **28 passed** across the same four widths.
  These tests assert that login gates do not perform application mutations.
- Generated request navigation sweep: **1,000 distinct paths passed** in 40
  batches, exercising Back, close, nested search, timing, submit/retry and cancel.
- Real isolated local API helper-area integration: **1 passed**, checking POST
  create, PATCH edit, DELETE and persisted GPS coordinates.
- Frontend unit suite: **477 passed** in 102 files, including auth/sign-out
  recovery, privacy export safeguards, state machines and source data rules.
- Backend suite: **661 passed**. Ruff formatting (272 files) and lint passed.
- Next production builds in both demo and guest modes, TypeScript, ESLint and
  Prettier passed. ESLint excludes generated browser traces from source checks.

The validation above used local data and isolated test services. Production
release verification is a separate check after deployment.
