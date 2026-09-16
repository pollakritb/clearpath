# Release evidence and production baseline

This runbook is the non-secret source of truth for a ClearPath release. Never
paste environment values, bearer tokens, private URLs, report images, precise
GPS coordinates, email addresses, or provider response bodies into this file.

## Stable production identity

| Item                 | Value                               |
| -------------------- | ----------------------------------- |
| Repository           | `pollakritb/clearpath`              |
| Release branch       | `main`                              |
| Production origin    | `https://clearpath-gray.vercel.app` |
| Vercel scope/project | `jec3/clearpath`                    |
| Supabase project     | `ClearPath`                         |
| Supabase project ref | `qnrtryspglioqhdxglzu`              |
| Source of truth      | ClearPath Supabase project only     |

The immutable release SHA must be read from `/api/ready`; do not trust the
mutable branch name or a manually maintained `RELEASE_SHA` value. A release is
verified only when the API SHA, GitHub Quality SHA, Vercel deployment SHA, and
production-smoke expected SHA are identical.

## Release evidence record template

Copy this section for each candidate. Use UTC timestamps and link to immutable
artifacts where the platform permits it.

| Field               | Required evidence                                           |
| ------------------- | ----------------------------------------------------------- |
| Candidate SHA       | Full 40-character Git commit SHA                            |
| Started / completed | ISO-8601 UTC timestamps                                     |
| Operator            | Named human or `Codex` for automated, non-approval work     |
| Environment         | Preview or Production plus exact HTTPS origin               |
| Change summary      | User-visible and operational changes                        |
| Commands            | Exact commands, without secret values                       |
| Local result        | Test counts, coverage, build/audit result                   |
| GitHub Quality      | Run URL, SHA, job conclusions                               |
| Vercel              | Deployment URL and SHA from `/api/ready`                    |
| Data freshness      | station/fresh/delayed/expired counts and latest timestamp   |
| Production smoke    | Run URL and conclusion                                      |
| Feature gates       | ML, GISTDA, community shadow, and Web Push states           |
| Exceptions          | Open issue, accountable owner, expiry, and rollback trigger |
| Rollback            | Previous known-good SHA and verification command            |

Minimum verification commands:

```powershell
npm run audit:prod
npm run format:check
npm run lint
npm run typecheck
npm run test:unit:coverage
npm run build
.venv\Scripts\python -m ruff format --check backend api scripts
.venv\Scripts\python -m ruff check backend api scripts
.venv\Scripts\python -m pytest --cov=backend --cov-report=term-missing
npm run test:e2e
```

Production checks must be read-only except the protected scheduler/smoke
workflow. Do not invoke a protected cron URL from browser history.

## Production feature inventory

`Configured` means the variable name exists in the Vercel Production scope; it
does not reveal or certify its value. Runtime evidence comes only from safe API
fields and fail-closed behavior.

| Gate / setting                      | Production inventory    | Runtime evidence / policy                                                     |
| ----------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `APP_ENVIRONMENT`                   | Configured              | `/api/ready.environment=production`                                           |
| `LOCAL_DEMO_MODE`                   | Not configured          | Defaults false; production must never enable it                               |
| `OPENMETEO_AIR_ENABLED`             | Configured              | CAMS/Open-Meteo is available in forecast provenance                           |
| `OPENWEATHER_AIR_ENABLED`           | Configured              | Provider may be fresh/stale independently; never fabricate fallback data      |
| `GISTDA_AIR_ENABLED`                | Configured, gate closed | Provider reports unavailable until both legal and technical gates pass        |
| `GISTDA_LICENSE_APPROVED`           | Configured, gate closed | Written owner/legal evidence is mandatory before opening                      |
| `COMMUNITY_FORECAST_SHADOW_ENABLED` | Configured, gate closed | Public response reports community context `not_used`                          |
| `ML_FORECAST_ENABLED`               | Configured, gate closed | No model version or artifact is served; external/baseline mode remains active |
| `ML_FORECAST_SHADOW_ENABLED`        | Configured, gate closed | Requires a registered artifact and shadow evidence window                     |
| `ML_FORECAST_CANARY_PERCENTAGE`     | Not configured          | Defaults to `0`; no canary traffic                                            |
| `PUSH_ENABLED`                      | Configured, gate closed | `/api/notifications/config.enabled=false`                                     |
| `AUTOMATIC_REVIEW_ENABLED`          | Configured              | Must still pass the complete OCR/GPS/time/continuity/duplicate policy         |
| `LINE_MESSAGING_ENABLED`            | Configured              | Authenticated delivery test is required; configuration alone is not a pass    |

The closed gates above are deliberate release controls, not missing features.
They may change only after the corresponding task IDs in the master plan have
machine-verifiable evidence and the named human owner has approved the change.

## Verified baseline — 2026-09-16

| Field            | Evidence                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Candidate SHA    | `75166c8c2a5f1a3a0e8cf0d37c18d5a8bf91eed1`                                                                                                             |
| Verified at      | `2026-09-16T05:58:33Z`                                                                                                                                 |
| Operator         | `Codex`                                                                                                                                                |
| Environment      | Production — `https://clearpath-gray.vercel.app`                                                                                                       |
| Change summary   | Canonical data-health monitor, Admin health summary, production evidence/backlog runbooks, and corrected production-smoke health contract              |
| Local result     | Frontend 74 passed; backend 290 passed with 81.68% coverage; Playwright 80/80 passed at 360/390/430 px; format, lint, typecheck, Ruff and build passed |
| GitHub Quality   | [Run 35059363023](https://github.com/pollakritb/clearpath/actions/runs/35059363023) — success                                                          |
| Vercel release   | `/api/ready.release=75166c8c2a5f1a3a0e8cf0d37c18d5a8bf91eed1`                                                                                          |
| Data freshness   | 177 total; 117 fresh; 46 delayed; 14 expired; latest observation `2026-09-16T12:00:00+07:00`                                                           |
| Production smoke | [Run 35059566395](https://github.com/pollakritb/clearpath/actions/runs/35059566395) — success                                                          |
| Closed gates     | ML, ML shadow/canary, GISTDA, community forecast shadow, and Web Push remain closed                                                                    |
| Previous good    | `cbdda81`                                                                                                                                              |

The production smoke exercised the protected sync path, waited for the exact
release SHA, and required at least one canonically fresh station. This record
does not approve the closed feature gates or replace human device/legal review.
