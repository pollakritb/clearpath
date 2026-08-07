# Forecast ownership and release decisions

This file is a template, not approval evidence. Replace every `TBD` with a named
person and a backup before staging shadow evaluation. An AI agent must not fill
human approver fields or infer consent.

Copy `forecast-external-evidence.example.json` to the gitignored project-root
file `forecast-external-evidence.json`, attach the source records outside Git,
and run `scripts/forecast_external_evidence.py` after every review. The
validator fails closed and never turns a placeholder or an unverified boolean
into approval evidence.

## Accountable owners

| Responsibility             | Primary | Backup | Contact channel | Authority                         |
| -------------------------- | ------- | ------ | --------------- | --------------------------------- |
| Product scope and horizons | TBD     | TBD    | TBD             | Accept product behavior           |
| Data/ML quality            | TBD     | TBD    | TBD             | Accept model/data evidence        |
| Production and incidents   | TBD     | TBD    | TBD             | Disable ML/cron, rollback         |
| Privacy/legal              | TBD     | TBD    | TBD             | Approve collection and retention  |
| Health communication       | TBD     | TBD    | TBD             | Approve labels and advice sources |

The Production/Incident owner must be able to set
`ML_FORECAST_ENABLED=false`, deploy the prior release and verify baseline
fallback without waiting for the Data/ML owner. Emergency rollback does not
require a model promotion decision.

## Release decision record

Create one immutable record per candidate and attach it to the matching
`forecast_release_decisions` row.

| Field                                      | Required value                                         |
| ------------------------------------------ | ------------------------------------------------------ |
| Decision ID                                | UUID/change-ticket ID                                  |
| Candidate registry ID/version              | Exact registry identity                                |
| Environment and horizons                   | staging/production plus explicit horizons              |
| Code release SHA                           | Full Git commit SHA                                    |
| Artifact/schema/dataset/model-card SHA-256 | All four checksums                                     |
| Data window                                | Earliest/latest source timestamps and manifest hash    |
| Baseline comparison                        | MAE/RMSE/category/false-safe per horizon and slice     |
| Interval evidence                          | Target and observed coverage per horizon/season        |
| Operations evidence                        | latency, error and fallback rate                       |
| Shadow/canary duration                     | Exact UTC start/end and sample count                   |
| Open risks/exceptions                      | Owner and expiry for every exception                   |
| Decision and reason                        | approve shadow/canary/promote/rollback/reject          |
| Approvers                                  | Named Data/ML and Production owners with UTC timestamp |

Never edit an artifact under an existing version. Registration creates only a
candidate/rejected row. Promotion is allowed only after the record above is
complete and the confirmation ID supplied to `scripts/promote_forecast_model.py`
matches the reviewed registry row.

## Monthly review record

Record source completeness, station/device changes, missingness and prediction
drift, settled metrics by horizon/station/district, incidents, costs, retention
cleanup, candidate dry-run result and the next review date. A review with too
few settled observations must say “insufficient evidence”; it is not a pass.
