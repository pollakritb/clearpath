# Performance and reliability review

Reviewed locally on 25 November 2026. This change targets shared read paths and
request lifecycle failures. It does not change publication, IDW, trust, XP,
measurement-request quotas, database schema, or production configuration.

## Changes and evidence

| Path                       | Finding                                                                                                                                                     | Change                                                                                                                                                                                                       | Verification                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Shared frontend API client | A stalled fetch, authentication lookup, or response body could keep a read pending indefinitely.                                                            | GET requests have a 45-second deadline covering the complete operation. Cancellation propagates to fetch, and timers/listeners are cleaned up. Writes retain their original behavior and are never replayed. | Tests for stalled fetch/body, retry after timeout, caller cancellation, already-aborted requests, and long writes. |
| Public browser cache       | The number of retained responses and invalidation-version entries could grow during long sessions. A pre-reset request could also refill a cleared cache.   | Retain at most 80 completed responses; remove expired entries on insert. Pending-request identity protects invalidation/reset without a growing version map. Existing TTLs and request deduplication remain. | Long-session eviction, reset-during-flight, invalidation, expiry, and request-sharing tests.                       |
| Place search               | Obsolete results were ignored, but their network requests continued after typing, clearing, or closing.                                                     | Abort the previous search immediately; retain debounce and stale-result protection.                                                                                                                          | Search cancellation component/API tests and mobile search browser coverage.                                        |
| News pagination            | A failed old pagination request could replace the error state after a successful refresh. Initial/refresh completions could also end a newer loading state. | Guard data, errors, and loading completion with the active request version.                                                                                                                                  | Regression tests for obsolete pagination success and failure after refresh.                                        |
| Satellite hotspots         | An older request for another selection could replace newer data/error/loading state.                                                                        | Only the current request may update the hook; invalidate ownership on unmount.                                                                                                                               | Out-of-order failure regression and existing available/unavailable/error tests.                                    |
| Backend map history        | Independent station and historical-reading I/O ran sequentially.                                                                                            | Start both reads concurrently; preserve the selection/freshness algorithm and existing failure handling.                                                                                                     | Deterministic overlap test plus historical result/route regressions.                                               |

## Controlled timing comparison

The same local benchmark performed five historical reads before and after the
change. Each read replaced the two persistence calls with independent 40 ms waits;
all selection code and threadpool overhead still ran.

| Metric                 |  Before |   After |
| ---------------------- | ------: | ------: |
| Median historical read | 86.5 ms | 43.7 ms |

This is about 49% less waiting for that controlled two-read workload. It is not a
production latency or whole-application speed claim. Actual response time depends
on Supabase, the network, data volume, client hardware, and concurrent load.

## Review boundaries

Existing behavior already defers Leaflet, shares in-flight public requests,
retains the map across tab navigation, and bounds the national forecast-grid
cache. These paths were inspected without replacing working behavior. No new
private/account response cache or stale-data fallback was introduced. Source
freshness, forecast expiry, and public-coordinate privacy remain authoritative.

Local validation includes frontend/backend unit suites, format/lint/type checks,
a production build, dependency audits, and the mobile browser suite. Browser tests
use isolated demo data and mocked external sources, not real production OCR,
OAuth completion, LINE delivery, or a production concurrency/load test. The
thousand-path sweep is included in a normal local run (opt-in on CI); the
guest-only environment is a separate run.

## Completed local validation

- Frontend: 610 unit tests across 115 files passed; format, lint, typecheck, and
  production build passed.
- Backend: 3,776 tests passed; Ruff format and lint passed. The existing
  Starlette/httpx deprecation warning remains.
- Main mobile browser suite: 594 passed, 32 conditionally skipped; all four
  viewport sizes (320/360/390/430 px), including the 1,000 distinct request paths.
- Guest-only environment: all 28 guest browser tests passed separately.
- Registered helper-area integration: the one opt-in, stateful 360 px test passed
  against an isolated real local-demo backend.
- The remaining three main-suite skips are intentionally redundant text-reflow
  variants; that test runs at its selected viewport in the main suite.
- Production dependency audits: npm reported zero vulnerabilities; pip-audit
  reported no known vulnerabilities.
- Final diff whitespace check passed; local frontend API health returned 200.

These results describe pre-deployment local validation. Production rollout is
verified separately through HTTPS smoke checks and the deployed release SHA.
No database schema or configuration change is required.
