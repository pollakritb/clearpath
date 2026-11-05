# ClearPath v2 — Contribution, report evidence, history and leaderboards

Status: implementation connected and locally tested; hosted activation not performed.
Delivery: [implementation and rollout details](../specs/2026-11-05-contribution-v2-implementation.md).
Date: 2026-11-05 (Asia/Bangkok).
Research: [primary sources and limitations](../../research/2026-11-05-contribution-trust-leaderboards.md).

## 1. Decisions and scope

Confirmed direction: preserve lifetime points and ranks; reward consistent useful
reports and missing place/time coverage; national calendar-month competition;
report evidence score with separate device status and user history; independent
known-answer image checks and controlled collection exercises before numeric
User Trust. Replace legacy report Trust and backend gap-fill together at launch,
not via a publicly exposed shadow phase. Offline evaluation remains mandatory.

Use these concrete rules as the v2 implementation baseline. Numeric evidence
weights and the proposed gap-fill cutoff are hypotheses requiring the validation
in section 12; they are not validated accuracy probabilities.

Four independent outputs:

- Contribution points: accumulated recognized work; used by rank and leaderboard.
- Report evidence: 0–100 rubric with components and unknown/invalid flags.
- Device evaluation: unknown / identified / independently evaluated, with scope/date.
- Reporter history: independently checked outcomes and counts, not automatic OCR approvals.

Do not combine these into a public personal trust number in v2. Do not introduce
additional report approval gates: number-only OCR publication stays automatic.
Admin stays read-only. Like/Dislike/Comment remain social and affect neither
points nor evidence. Private locations and identity choices never change awards.

## 2. Contribution points

| Event                                                                                      | Points | Limits                                      |
| ------------------------------------------------------------------------------------------ | -----: | ------------------------------------------- |
| Qualified report                                                                           |     10 | 5 per Thai calendar day                     |
| First qualified report that day                                                            |      5 | Once per day                                |
| Useful service: fulfill another person's request OR cover a published missing-data mission |      5 | One per report; 3 combined per day          |
| Five qualified contribution days in one calendar week                                      |     20 | Once per week; days need not be consecutive |

Daily activity maximum 70, plus one weekly 20 event; maximum full calendar week
510 if all activity caps are reached. A day receiving the weekly reward can total 90. No independent hard daily-70 clamp may suppress the weekly award.

Base qualification: approved, valid published PM2.5, nonduplicate, credible capture
not in the future and no older than three hours at submission; preserve the 30-minute
report spacing. A system-extraction failure is not evidence of user misconduct.

Define spacing against the previous report which received positive base or useful-
service points, using server submission time. Weekly/first-day bonus events do not
restart the cooldown. Serialize decisions per user and process in event order.
A base daily cap does not by itself prevent a remaining useful-service bonus.

First-day and weekly bonuses require a positive base report award. A bonus-only
report cannot create a contribution day. First-day award attaches to that report;
weekly award attaches to the fifth distinct qualified day. Use server submission
time for Thai day/week/month, not device clock or worker execution time.

Week is Monday 00:00 to next Monday 00:00 Asia/Bangkok. User timezone changes
cannot move awards. No v2 bonus for pre-launch activity, including days in the
launch week before T0. Points for high and low PM concentrations are identical.

Request fulfillment: retain current automatic all-matching-request fanout and
exact-location/time-window matching. No claim required. Own request may be fulfilled
but cannot earn service points. Five matched requests still yield one service bonus.
Retain request pair caps: one positive service award per helper/requester/day and
three within seven rolling days. Choose the oldest eligible other-user request.
Retain camera/EXIF evidence, capture-to-submit <=15 minutes, submission GPS accuracy
<=200 m and GPS within 200 m of report location for service bonuses.

If the same report also satisfies a mission, one +5 maximum: eligible other-user
request first, otherwise mission. Save all useful outcomes separately from award
provenance. A matched request count must never be used as a point multiplier.

## 3. Missing-data missions

Server creates missions from observed coverage before contributions, not from a
user's request or a self-declared empty area. Use stable, deterministic regional
centers with a 2 km mission radius (haversine). This is a product coverage area,
not a claim of the sensor's spatial resolution or a CAMS cell.

Initial candidate: no fresh Air4Thai within 5 km and no usable approved outdoor
community report within 2 km in the previous 60 minutes. Candidate input quality
checks are explicitly versioned and must not simply follow whether IDW included it.
Worker checks every 15 minutes; mission lifetime 60 minutes. Start with bounded
service regions/user-demand regions rather than generating every empty point nationwide.

Only a fresh outdoor, nonduplicate report with required location evidence can
complete a mission. A mission rewards one independent measurement source once;
atomic completion prevents adjacent/overlapping missions and concurrent copies
from multiplying rewards. Other reports remain accepted and can earn base points.
If shared-source independence is unknown, do not manufacture proof from a new
account or user-entered device nickname; use conservative source grouping.

Store mission ID, area/window, announced eligibility, rule version and input snapshot.
Do not retroactively declare a mission because a report has already arrived.
Do not publicly expose saved home/work points or exact reporter coordinates.
UI offers missions when available; ordinary reporting never requires travel.

## 4. Report evidence rubric

Evidence v2 is an additive representation of a fixed-denominator weighted rubric:
T = 0.40 E + 0.30 C + 0.30 L, each component normalized 0–100.
Equivalent implementation uses maximum component points 40 + 30 + 30.
Round once to one decimal; store the underlying evidence and rule version.
No renormalization when facts are unknown.

| Component                  | Subcheck                                                                                          |  Proposed points |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ---------------: |
| Image / reading, max 40    | Numeric value can be extracted                                                                    |               20 |
|                            | Evidence identifies the PM2.5 field, distinct from AQI/PM10                                       |               10 |
|                            | Unit is supported as micrograms per cubic meter                                                   |               10 |
| Time / provenance, max 30  | Valid server-bound camera-session association, or supported original-image time/location evidence |               15 |
|                            | Capture age <=15 min / <=60 min / <=180 min / older or unknown                                    |  15 / 10 / 5 / 0 |
| Location / context, max 30 | Capture GPS accuracy <=50 / <=100 / <=200 m / unknown or worse                                    | 20 / 15 / 10 / 0 |
|                            | Coherent location/time evidence                                                                   |                5 |
|                            | Context and averaging-period metadata explicitly recorded, including 'unknown'                    |                5 |

A valid session links the submitted evidence; it is not cryptographic proof that
an arbitrary camera image is a truthful measurement. EXIF is metadata, not a
reference calibration. Source types remain visible. OCR confidence alone is not
a calibrated probability and must not receive points proportional to its raw value.
Field and unit checks require extraction evidence tested on held-out images;
unknown or conflicting fields get 0 for that subcheck, without blocking publication.

Method declarations are labeled 'user supplied'. Selecting outdoor or stable does
not prove measurement technique. An indoor report may have complete evidence but
still be unsuitable for outdoor gap-fill. Avoid judging indoor context as dishonest.

Unknown/ambiguous/invalid are separate states, not just a low total. Critical field,
unit, temporal or location ambiguity blocks analytical inclusion independently of
T. Do not add reputation, engagement, station agreement, rank or device price.
Do not add a score merely because the user claims their device was calibrated.

Time/provenance score is evaluated at submission and stays reproducible. Current
age and is_fresh remain dynamic separate fields; stale readings cannot influence
current surfaces even with a high historical evidence score.

## 5. Devices and independent observations

Device status: unknown, identified, evaluation available. Store model, optional
stable private instance ID, method/date, reference instrument, averaging period,
conditions, validity and provenance of evaluation. Self-entered labels identify
a declaration, not validated quality; unavailable serial numbers are allowed.

A controlled comparison validates that instance/model only within the tested
conditions. Do not infer all units are calibrated from a model name. Do not infer
accuracy from channel agreement or one nearby-station match. No imported US
correction equation without applicable local validation. Preserve raw readings.

Corroboration requires distinct reporters AND independent measurement sources,
compatible outdoor context, comparable periods, nearby times and locations.
Two accounts reading one instrument are one measurement source. Image reuse,
near-identical captures and shared verified device IDs are grouped. Missing device
identity is an uncertainty to handle explicitly, not permission to assume independence.

## 6. Reporter history

Use confirmed pass / confirmed problem / unresolved outcomes with scoped checks:
image extraction, metadata integrity, controlled protocol and instrument comparison.
Keep evidence source, evaluator/process, time and evaluation-rule version.
Routine OCR approval is not a successful independent check. OCR/system failure,
missing calibration, unknown device or station disagreement is not user fraud.

Display counts and date range. Raw pass rate is pass/(pass+problem), excluding
unresolved, labeled as 'evidence check pass rate' only. With zero conclusive results,
return null, not 0 or a fictitious public 50. Always show sample count; do not rank
users by this percentage. Subsamples refer to evaluation scope, not universal accuracy.

Known-answer image fixtures test the system. User image-reading exercises measure
reading skill and cannot be promoted into field-report reliability. Controlled
field activities may create independent outcomes with appropriate consent and
retained provenance. No Admin decision buttons or fabricated historical outcomes.
Numeric Bayesian User Trust, priors and population thresholds are deferred pending
an independent outcome dataset; this does not defer report evidence v2 or gap-fill v2.

## 7. Backend gap-fill cutover

At T0 replace old report Trust and old gap-fill policy together using a single
policy release pointer. Initial candidate T>=70 is for offline comparison only;
freeze the actual threshold after held-out testing, not by copying legacy >=60.

Mandatory conditions in addition to score: approved, valid PM2.5 field/units,
fresh <=3h, usable capture time and GPS <=200m, outdoor, no direct emission-source
measurement, no duplicate, required provenance, no fresh official observation
<=1h within 5km, and >=2 independent compatible reporters/sources in 2km/1h
INCLUDING the target. 'Two reporters' never means target plus two additional users.
Self-declared stability/calibration cannot bypass independent corroboration.

Freshness expires and evidence/source support can change: analytical eligibility is
re-evaluated at query/surface build time using the same active policy version.
No silent mix of v1/v2 scores inside one aggregate. Missing-score legacy reports
remain displayed but cannot inherit a new score fabricated from default fields.

Do not invent extra Trust-to-IDW multiplication or change existing backend spatial
weighting without a separate validated decision. Place IDW remains explicitly
unchanged: 2km, public coordinates, fresh official <=1h and approved reports <=3h,
distance-only inverse-square weights, no Trust/XP/stability multiplier.

## 8. Calendar-month leaderboard and ranks

Default 'this month', optional previous months, and 'all'. Use [month start,next month
start) in Asia/Bangkok and sum v2 ledger awards assigned by server event time.
At launch the first month is visibly a partial period beginning T0; do not move
old v1 awards into the new season or backfill missed rewards. Freeze existing v1
lifetime baseline and retain the original ledger, not a duplicate positive award.

Sort by points descending; equal points share rank (1,2,2,4). A stable member ID
can determine display order only, not break a tie. Do not use Trust, Google identity,
private GPS or device status as tiebreakers. Keep privacy controls and hidden users
out of public lists; their own scores remain accessible.

Lifetime = unchanged prior ledger + v2 awards - valid compensation events.
Existing rank thresholds and logos remain 0/100/500/1500/5000. Inactivity never
reduces rank. Reconsidering rank thresholds is a future explicit change, not bundled
with the new points rollout.

Monthly close: show provisional results until +72h for delayed jobs, then freeze
with a revision number. A later confirmed correction creates an explicit revised
result/audit entry rather than silently rewriting a published winner. Awards retain
their activity period, not the month the worker recovered.

## 9. UX and contracts

Profile: lifetime points/rank, this-month points/rank, distinct qualified days,
base awards, service awards, actual matched requests and completed missions.
Fix old help_count ambiguity; retain legacy counts labeled as historical awards.
Do not pretend missing historical match data is zero actual help.

Reports: PM2.5 unchanged and primary, capture time/context, evidence score with
component explanation and missing facts, device status, current analytical-use
reason, user history summary only when public identity permits it.

Submission result: itemize +10/+5/+5 and weekly +20 separately, list all reasons,
count actual fulfilled requests separately; do not promise points before settlement.
Pending states are award processing, not Admin approval. Rank-up notification is
a durable per-user event, not only browser sessionStorage.

Month leaderboard: emphasize personal monthly contribution, then national list;
allow opt-out and selected Google/alias identity. Evidence average, if displayed,
is secondary, with sample size/window and no comparative quality leaderboard.

Social interface remains Like/Dislike/Comment. Legacy star endpoints may store
compatible feedback but must no longer mutate the active evidence score, reputation
history or gap-fill decisions. Preserve historical events; do not delete legacy APIs
blindly. Remove stale claim-first and Admin-verification language from v2 displays.

Pydantic and TS contracts must mirror; additive typed evidence components,
policy_version, device status, evaluated history, award breakdown and seasonal
period fields. Legacy clients get coherent semantics and explicit versions.

## 10. Persistence, concurrency and privacy

Extend the existing points ledger rather than introduce a competing source of truth.
New event kinds: first_day, contribution_week, service (or existing help with scoped
source metadata), with rule version and natural event identity. Totals and existing
query functions must count all new award kinds while computing report/help counters
from the correct event kinds, not from positive row count.

Natural uniqueness: report base; user/day first-day; report service; user/week
five-days; measurement source/mission completion. DB transactions serialize per-user
quota and cooldown; locks acquired in a fixed order for user/mission/request.
Durable workers and an outbox handle retry-safe awards and notifications. Do not
make browser polling the only means of settlement.

Versioned evidence records retain inputs/components/reasons/scoring time. Preserve
old score/version and historical aggregate policy so research/audit remains reproducible.
Outcome records, private devices, mission snapshots and rollout control are server
owned. Browser can read own private history; public serializers never expose private
GPS, home/work points, serials or cross-report linkage of anonymous users. RLS and
explicit grants apply to all new exposed-schema tables and functions.

Automated compensation may reverse a confirmed invalid award once using the
original-event reference; no direct Admin edits and no point confiscation based on
unresolved flags. Dependent day/week rewards are reconciled with provenance.
Consumed daily quota is not reopened for repeated abuse. Operational rollout itself
never reverses any legacy score or lowers a user's existing rank.

## 11. Implementation sequence and file responsibilities

1. Pin v2 rules and fixtures; validate currently available image/time/GPS facts and
   defaults. Document genuine unknowns rather than treating defaults as observations.
2. Pure functions: split contribution eligibility/bonuses, season boundaries,
   evidence scoring, history summary and gap-fill decision. No DB/network in algorithms.
3. Additive DB migration and RLS; versioned control defaults OFF. Update ledger RPCs,
   idempotency/locking and aggregation together. Install in isolated local DB first.
4. Backend services: capture evidence, independent-check import, private devices,
   mission generation, all-request reconciliation, ledger and outbox. Thin routers.
5. Mirror Pydantic/TS API contracts; preserve existing callers and reason mapping.
6. Frontend mobile profile, report details/result, missions and monthly leaderboard;
   lazy-load history/details; avoid per-row API requests. One <=430px layout.
7. Run held-out evidence/gap-fill evaluation and race/replay/time-boundary tests;
   finalize threshold/rubric before production activation.
8. Rehearse migration and full rollback on production-shaped data. Release code
   with policy OFF, install additive schema, prepare old-ledger baseline and genuine
   historical evidence where available. Drain old jobs and activate one pointer.
9. Verify production contracts, monitor award duplication, coverage and exclusions;
   record launch version/time and first partial-month rules.

Primary existing paths: backend/algorithms/community_xp.py, trust.py,
community_quality.py; backend/services/community/drafts.py, xp.py, reviews.py,
presenter.py; backend/services/measurement/registered.py; backend/routers/xp.py,
cron.py; backend/models/xp.py, community.py, schemas.py; frontend/types/*;
frontend/components/community/XPDashboard.tsx, ReportXPResult.tsx, RankDetails.tsx;
report/map cards and private settings. Final module boundaries follow repo FE/BE split.

## 12. Acceptance tests and launch gate

Behavior: 1 report/5 requests -> 5 fulfilled outcomes, <=one +5; self-request no
bonus; overlapping mission no double bonus; registered/anonymous/new users earn
under identical rules; weekly nonconsecutive five days; 5-report/3-service caps;
spacing unaffected by weekly award; rates computed from conclusive checks only.

Boundary: submission 23:59/00:00 Thai, Sunday/Monday, month/year boundaries,
T0 midweek/month, late settlement, concurrent same-user uploads, repeated workers,
last mission claimant race, reversed report's day/week dependency, out-of-order jobs.

Quality: wrong AQI/units can publish per number-only policy but cannot enter analytical
pipeline; image replay, image/system extraction errors, new users, unknown devices,
shared devices, lack of calibration, indoor reports, known source emissions, legitimate
local spikes unlike CAMS/Air4Thai, source freshness, absent GPS and expired support.

Evaluation set separates user/device/session/time across training and held-out test;
report counts and uncertainty, false analytical inclusion/exclusion and subgroup
coverage. Require no invalid units, no known duplicate source counted independently,
no invalid-GPS inclusion in deterministic adversarial fixtures. Quantify empirical
error with confidence intervals; choose statistical launch targets before inspecting
the held-out outcomes. If no independent evaluation set can be obtained, do not
activate a falsely validated numerical threshold; report the blocker explicitly.

No legacy lifetime point/rank changes at migration. Anonymous RLS cannot read private
rows or execute award/control functions. Admin remains read-only. All production
points originated by server-confirmed events. External provider comparison or social
votes alone never penalize user history or change evidence.

Required checks: FE format/lint/typecheck/build and meaningful unit/UI flows; Python
ruff + pytest; real local SQL migration/RLS/concurrency contracts; mobile 320/393/430px,
GPS denial and privacy. Production smoke verifies exact deployed commit and policy.

## 13. Rollout and rollback

Keep all v2 jobs prepared but inactive until schema, code, frozen rubrics and the
baseline evaluation pass. At T0 briefly pause award writes, reconcile pending v1
jobs, snapshot totals and switch the shared policy. Resume durable settlement with
clear event-time ownership so no report receives both v1/v2 rewards.

Rollback disables new v2 writes/missions and restores one coherent evidence/gap-fill
policy. Preserve all already-earned v2 ledger events and totals. Keep v2-aware
readers capable of displaying them; rolling back code to a version that ignores new
event kinds is not a valid rollback. Do not erase points, device records or evaluation
provenance. Publish revised seasonal results if corrections were necessary.

Out of scope: user-Trust leaderboard, reference-accuracy percentage from a photo,
public exact private addresses, manual Admin awards/review, automatic punishment
from station disagreement, new CAMS correction formula, and automatic Trust
multiplication into Place IDW.

## 14. Latest voting location amendment (2026-11-05)

The user's latest instruction supersedes the research-gated radius: use **500 m
as a temporary product policy**, then research/validate it later. The stored
reference explicitly says temporary, user-directed policy, not scientific validation.
The radius is enabled in the v2 demo and is the additive release-table default.

Check haversine distance using private report coordinates and the sum of both
reported position errors: d + a_voter + a_report <= 500 m. An interval crossing
the boundary requires another fix, not a claim of certainty. This is conditional
error-bound geometry, not a joint 95% guarantee. Missing report accuracy and
invalid/expired fixes cannot pass. Withdrawal and comments stay available.
Votes do not change points, evidence or user history. Other radii are unchanged.
The earlier [source review](../../research/2026-11-05-voting-location-policy.md)
remains a record of what the literature does and does not support.
