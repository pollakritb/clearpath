# Health communication source register

Status: **candidate official sources; domain approval still required**
Last source review: 2026-08-03

ClearPath must never turn these sources into a claim that its forecast is an
official warning or guaranteed medical advice. Observation, forecast,
uncertainty, freshness and source remain visibly separate. A qualified
air-quality/health communication approver must approve exact Thai copy and the
mapping from PM2.5 bands before public launch.

## Candidate authoritative sources

| Intended use                              | Official source                                                                                                                                                                 | Review note                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thai AQI/PM2.5 bands and category wording | [Pollution Control Department: Thailand AQI criteria and area air-pollution management](https://www.pcd.go.th/wp-content/uploads/2025/05/pcdnew-2025-05-14_02-32-38_602516.pdf) | Verify every threshold against `backend/core/aqi.py`; do not mix 24-hour standard wording with an hourly forecast claim.                                            |
| General current protective actions        | [Department of Health: PM2.5 protective guidance](https://anamai.moph.go.th/th/news-anamai/44890)                                                                               | Candidate actions include checking official readings, reducing outdoor exposure, suitable masks and clean-air rooms. Approver must select exact audience/band copy. |
| Child-specific caution                    | [Department of Health: child guidance for orange/red conditions](https://anamai.moph.go.th/th/news-anamai/44705)                                                                | Generic N95 advice must not be copied to children under five; the source describes a breathing-resistance caution.                                                  |
| Clean-air-room directory and guidance     | [Department of Health clean-air-room service](https://podfoon.anamai.moph.go.th/)                                                                                               | Link as an external official resource; availability and content are outside ClearPath control.                                                                      |
| Official current observation source       | [Air4Thai](http://air4thai.pcd.go.th/)                                                                                                                                          | Present as observation/source link, never as evidence that a ClearPath forecast was issued by PCD.                                                                  |

## Approval procedure

1. Export every user-facing AQI/health sentence from the app and notification
   templates, including empty/error/high-PM states.
2. Map each sentence to one source, audience (general/risk group/child), PM2.5
   band, observation/forecast context and last-reviewed date.
3. Verify `backend/core/aqi.py` thresholds against the approved PCD source.
4. Ensure forecast copy says it is an estimate, includes uncertainty/freshness,
   and directs urgent symptoms to appropriate professional care without making
   diagnosis or treatment claims.
5. Test Thai copy at 360/390/430 px, large text and screen reader output after
   any wording change.
6. Record approver, credentials/role, exact document/copy SHA-256, date, open
   exceptions, expiry and next review outside Git.
7. Add the approved HTTPS source URLs to `security.health_sources`; set
   `security.health_source_approved=true` only after sign-off.

## Sign-off record

| Field                       | Value |
| --------------------------- | ----- |
| Air-quality/health approver | TBD   |
| Privacy/legal reviewer      | TBD   |
| Approved copy SHA-256       | TBD   |
| Approved at (UTC)           | TBD   |
| Evidence/change-ticket ID   | TBD   |
| Exceptions and expiry       | TBD   |
| Next review date            | TBD   |
