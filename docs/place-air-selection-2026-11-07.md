# Place air source selection — 7 November 2026

## Rules

- Search within 2 km using public coordinates and haversine distance.
- Stations must be fresh, eligible for the surface and no more than one hour old.
- Reports must be approved, have a finite PM2.5 value and have been measured no more than three hours before the selected time.
- Choose the latest eligible report per private author **within the search circle**. A newer report outside the circle or an invalid report does not displace the eligible nearby reading. Equal timestamps use report ID as a deterministic tie-breaker.
- One contributor uses its value directly. Multiple contributors retain distance-only inverse-square IDW, including the existing exact-public-point behavior. Trust, XP and reactions do not multiply the weights.
- Retain excluded reports as accessible history; they never contribute extra weight.

## Privacy and integration

`GET /api/community/place-report-selection?lat=…&lon=…&at=…` returns only selected public report IDs and the target time, with `Cache-Control: no-store`. Private author IDs, identity group mappings and exact coordinates are never returned. Input coordinates are validated and the time window is restricted to the previous 24 hours, with a small clock-skew allowance.

The service reads existing approved report history and derives the same obfuscated coordinates used by the public presenter. A pure function selects one report per author. There is no database migration or write. This works for anonymous reports without creating a stable public anonymous identity.

Current and historical place views share the selection hook. It ignores late responses after a place/time/data change. Until selection succeeds, community reports are excluded; station values remain available. On selection failure the UI explains the omission and recovery. No selection request is made when no eligible community reports are present nearby.

## Presentation

The compact header shows source counts, measurement age and approximate distance for a single source. For multiple sources it shows the latest contributing measurement age and radius. The expanded panel explains a single reading is not an average, lists contributors first, and folds excluded readings under a separate disclosure with reasons. The method disclosure explains age limits, latest-per-author selection, IDW and the meaning of the search circle.

## Verification

Frontend unit tests cover repeat reports, same-name different people, private server selection, response races, unavailable selection and the single-source/excluded-source presentation. Backend tests cover private-author selection, deterministic order, freshness boundaries, public-coordinate range, newer ineligible/outside readings, service privacy and endpoint validation. Browser fixtures cover the source disclosure and existing place/search/history/forecast flows at 320/360/390/430px. Fixtures are not production measurements. Physical-device and live-provider validation remain separate.

This change does not modify Reporter Trust, backend community gap-fill or report publication policy. Release requires the frontend and backend changes together.

Latest local results: 376 frontend unit tests, 548 backend tests and 20 place-flow browser cases passed. TypeScript, ESLint, Prettier, Ruff and the production build passed. The targeted design scan reported no findings. Browser cases use fixtures; no production write or deployment was performed for this change.
