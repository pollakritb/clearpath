# Research for ClearPath contribution, trust and leaderboard redesign

Reviewed 2026-11-05. Research notes and proposals only; no production policy changes.
This is a focused comparison of primary project documentation and selected research,
not a systematic literature review or validation of a scoring formula.

## Previously confirmed decisions

- Preserve existing lifetime points and ranks.
- Begin a new rule version and national calendar-month leaderboard in Asia/Bangkok.
- Replace report Trust and backend gap-fill eligibility together at activation,
  after offline validation; this does not change publication's number-only OCR policy.
- Place IDW remains separate: 2 km, public coordinates, distance-only inverse-square
  weights, with its current source and freshness rules.
- Admin remains read-only; do not import expert approval workflows from other projects.
- Prior unanswered questions about numeric bonuses and device-score defaults are
  deferred until the research-informed design is agreed.

## Comparison of operational systems

| System                          | What the documentation establishes                                                                                                                           | Proposed application                                                                       | Boundary                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| PurpleAir                       | Confidence reflects agreement between channels A/B and abnormal-channel handling.                                                                            | Explain exactly which measurement property a score describes.                              | Agreement within one device is not reference accuracy. We lack A/B readings for ordinary uploaded photos.                          |
| EPA / AirNow Fire and Smoke Map | Sensor data undergo QC and provider-specific correction before map integration.                                                                              | Separate raw readings, evidence checks, device evaluation and analytical inclusion.        | US PurpleAir corrections cannot be assumed valid for Thai handheld devices.                                                        |
| iNaturalist                     | DQA separates verifiable observations, Needs ID, Research Grade and Casual; evidence/date/location and community identification matter.                      | Per-report evidence states and separate analytical eligibility.                            | Biological identification consensus cannot be copied as a vote on numeric PM accuracy.                                             |
| eBird                           | Unusual date/location/count triggers additional documentation; a flag is not proof the observation is wrong. Personal records and public inclusion differ.   | Differences from stations/models are contextual signals, not automatic personal penalties. | eBird uses human reviewers; ClearPath cannot copy the approval queue under its current conventions.                                |
| Zooniverse                      | Independent classifications are combined; its leveling framework measures skill against expert-defined gold-standard subjects, with sample-count thresholds. | Verified user history requires independent outcomes and sample size.                       | Counting OCR publication as ground truth would be circular; multiple accounts photographing one meter are not independent sensors. |
| Strava                          | Challenges define their own progress/leaderboard eligibility; Local Legend rewards segment frequency over rolling 90 days.                                   | Separate cumulative recognition, seasonal competition and personal missions.               | Its public-activity requirements should not force ClearPath users to expose precise locations.                                     |

Primary project sources:

- PurpleAir staff explanation (use the original staff post, not subsequent community proposals): https://community.purpleair.com/t/how-the-confidence-score-is-calculated/10641
- EPA QC and correction: https://www.epa.gov/air-sensor-toolbox/technical-approaches-sensor-data-airnow-fire-and-smoke-map
- EPA QA planning: https://www.epa.gov/air-sensor-toolbox/quality-assurance-air-sensors
- EPA collocation: https://www.epa.gov/air-sensor-toolbox/air-sensor-collocation
- iNaturalist DQA: https://help.inaturalist.org/en/support/solutions/articles/151000169936
- eBird review: https://support.ebird.org/en/support/solutions/articles/48000795278-the-ebird-review-process
- Zooniverse consensus: https://zooniverse.freshdesk.com/support/solutions/articles/44001770581-i-m-worried-i-m-getting-it-wrong-
- Zooniverse skill framework: https://help.zooniverse.org/next-steps/leveling-up/
- Strava Challenges: https://support.strava.com/en-us/articles/15401916-strava-challenges
- Strava Local Legend: https://support.strava.com/en-us/articles/15401751-what-is-the-local-legend-achievement-on-strava

## Selected empirical research

### CrowdWater: training through quality-control tasks (2020)

Strobl et al., Training citizen scientists through an online game developed for
data quality control, Geoscience Communication 3, 109–126.
https://doi.org/10.5194/gc-3-109-2020
https://gc.copernicus.org/articles/3/109/2020/

The study used 52 participants, with 42 completing the outdoor task. Picture-based
training improved staff-gauge placement and assessment of reference pictures.
Self-assessed confidence did not predict actual performance in this study.
Recruitment was highly university-educated and the before/after design used
repeated materials; this is not evidence for a universal retention benefit.

Proposal: add short examples of good/bad evidence with immediate explanation;
measure actual outcomes rather than reward checking "measurement stable".

### Quantum Moves: leaderboard variants (2017 preprint)

Pedersen et al., Leaderboard Effects on Player Performance in a Citizen Science Game.
https://arxiv.org/abs/1707.03704
https://arxiv.org/pdf/1707.03704

4,553 new players were compared across sequential no-board, Top-5 and relative-board
conditions. Replay-rate differences were not statistically significant. The cohorts
were not simultaneously randomized and were affected by the timing of media attention.
This is not evidence that leaderboards never help, nor that any format universally wins.

Proposal: keep the approved monthly leaderboard, but evaluate useful coverage,
repeat participation and evidence quality rather than assuming ranking is beneficial.

### Mobile PM sensors: calibration transfer (2023 preprint)

deSouza et al., Evaluating the Performance of Low-Cost PM2.5 Sensors in Mobile Settings.
https://arxiv.org/abs/2301.03847

An OPC-N3 / DustTrak mobile deployment in Boston compared correction approaches.
More complex stationary corrections did not transfer best; minute-level collocation
corrections generally transferred better than hourly-based corrections in this study.
Devices, movement and averaging periods differ from ClearPath handheld snapshots.

Proposal: preserve measurement context and averaging period where known; do not infer
accuracy from a single comparison to an hourly station or a CAMS grid cell.

## Design implications, not externally validated formulas

1. Participation points answer "what useful work was contributed?" Separate them
   from evidence and instrument accuracy. No bonus proportional to PM concentration.
2. Report evidence should expose components and missing facts. An aggregate must
   never let high user reputation offset a critical missing or invalid fact.
3. Instrument status should distinguish unknown, identified and independently
   evaluated, including the scope/date of any evaluation. Unknown is not failure.
4. User history should distinguish extraction/metadata integrity from measurement
   accuracy. Only events with an independently specified outcome can feed reliability.
   Unresolved evidence and system OCR failures must not automatically count as fraud.
5. Ground-truth evidence, quantity and uncertainty must be available before showing
   a numeric User Trust as if it were established. Bootstrap data must be addressed.
6. Votes are social feedback. Independent corroboration needs separate observations
   and attention to shared instruments, reused images, time and location.
7. Publication, points and analytical use are three separate decisions. Keep OCR
   publication behavior; compute gap-fill eligibility separately and explain exclusions.
8. Do not multiply a PM value by a trust percentage. No new Trust multiplier in
   Place IDW. Any backend weighting change requires separate validation and versioning.
9. Choose whether to reward frequency, unique observation days or under-observed
   place/time windows before choosing point amounts. Limit repeated rewards for the
   same evidence/source/window while keeping ordinary submission available.
10. Preserve prior points/ranks and old calculation versions. Monthly rollout mid-month
    must disclose partial-period coverage; no fabricated retrospective evidence.

## Evaluation required before one-time activation

- Compare current/new gap-fill decisions on a held-out, labeled evaluation set;
  separate by user, device and time to avoid duplicate evidence leakage.
- Include new users, devices with unknown quality, reused instruments, low/high PM,
  indoor/outdoor, GPS error, image/unit ambiguity and legitimate local divergences.
- Define a false inclusion/false exclusion tradeoff; do not reuse the old cutoff 60
  without testing the distribution and interpretation of the new score.
- Report useful independent place/time coverage, qualified contribution days,
  recurrence, duplicate attempts and geographic concentration alongside leaderboard use.
- Verify ledger retries, period boundaries, counters for matched requests versus
  awarded bonuses, reversals and privacy. Reversals must be deterministic server
  operations with provenance, not manual Admin edits.
- Freeze the agreed formula/eligibility policy before activation and retain a rollback
  to the prior calculation version without erasing history.

## Questions to resolve next

1. Which behavior is the priority: consistent local tracking, filling missing
   place/time coverage, or maximizing independent observations?
2. Which quality facts must a user see: separate evidence/device/history statuses,
   or an aggregate evidence score with those statuses still visible?
3. What independent checks can the project actually obtain: known-answer image
   tasks, controlled measurement sessions, or device/reference collocation?

These decisions precede arbitrary point amounts, Bayesian priors, component weights,
minimum sample counts and gap-fill thresholds. None of the reviewed sources validates
35/25/25/15 weights or a universal numerical Trust threshold for ClearPath.
