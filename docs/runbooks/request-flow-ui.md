# Mobile measurement-request navigation

The request tool uses an explicit path in `useRequestFlow`. Back removes one
entry; Close clears the flow. Opening location search from the picker returns
to that picker on Back, retaining the point. Returning from the form to edit
the point retains the timing draft. A new request starts with “now”.

| Control                                     | Expected result                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Map → ขอค่าฝุ่น                             | Start location search with a clean draft                               |
| Search → Back                               | Previous picker, or main map if this is the first step                 |
| Search → Close                              | Main map, discard draft                                                |
| Search result / recent / current location   | Picker at selected location                                            |
| Clear query / remove recent / clear history | Stay in search                                                         |
| Picker → Back                               | Previous search; repeated Back eventually reaches main map             |
| Picker → search bar                         | Search; Back preserves selected point                                  |
| Picker → current location                   | Move point; stay in picker                                             |
| Picker → confirm                            | Form with preserved timing draft                                       |
| Form → Back                                 | Picker without appending a new form/picker loop                        |
| Picker / form → Close                       | Main map, discard draft                                                |
| Submit in flight                            | No duplicate send or leaving an unresolved submission                  |
| Submission error → retry                    | Same idempotency key until inputs change                               |
| Submit success                              | Compact request status on map                                          |
| Cancel → เก็บไว้                            | Keep request and return to status                                      |
| Cancel → confirm                            | Remove marker; retain cancelled history                                |
| Completed request                           | Result/report link when available; no non-existent request marker link |
| Help → report → ดูสถานะคำขอ                 | Corresponding request detail                                           |
| Request detail → Back                       | Previous in-app entry; fallback to request list                        |
| Request list → Back                         | Previous in-app entry; fallback to main map                            |

Coverage: `e2e/request-flow.spec.ts`, request cases in
`e2e/mobile-ux-regressions.spec.ts`, `e2e/place-search.spec.ts`,
`frontend/hooks/useRequestFlow.test.tsx` and measurement component tests.
Browser regressions use mocked request/location APIs and local demo login,
including submission failure/retry, cancel/keep, requester and helper flows.
They do not send production requests or LINE notifications.

## Thousand-path browser sweep

`e2e/request-thousand-paths.spec.ts` generates 1,000 distinct reproducible
12-action sequences. They are partitioned across 320/360/390/430px viewports
(250 each), with 25 paths per browser batch. Every action checks its destination;
form actions also check timing and disclosure state. Paths finish through Close,
Back to root, submit/cancel, or failed-submit/retry/keep/cancel. Each batch attaches
JSON containing the path ID, viewport, actual actions and pass/fail result.
The exhaustive sweep is opt-in on CI via `RUN_REQUEST_PATH_STRESS=true`.
These are automated browser paths using mock request/location APIs and demo login,
not 1,000 human testers, concurrent users, or a backend load test.

Terminal requests never offer a continued help action, even when a previous claim deadline is still in the future.
