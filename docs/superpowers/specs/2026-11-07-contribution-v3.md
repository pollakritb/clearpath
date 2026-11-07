# Contribution v3: additive XP policy

This implementation adopts the owner's November 7 specification. XP rewards eligible participation; it does not represent instrument accuracy, Community Trust, report approval, IDW weight or voter power. Existing balances/ranks are preserved. Waze/Local Guides/Duolingo motivate the product design; ClearPath's numbers are its own policy.

## Awards and limits

- Eligible approved report: 10 XP, at most five positive report grants per Thai calendar day.
- First positively rewarded report of a day: 5 XP, one shared day key across versions.
- Service (help request or published coverage mission): 5 XP, at most three combined daily grants and at most one per report. Service-only grants remain possible after five base reports.
- Five rewarded report days in a Monday–Sunday Thai week: 20 XP, one shared week key, nonconsecutive days allowed. At most 70 normal XP/day, or 90 on the weekly-bonus day.
- Report/service awards start a 30-minute cooldown. Zero-point attempts and first-day/week bonuses do not extend it. All versions and reversed positive grants consume the relevant quota/cooldown.
- Use immutable server submission time for occurrence, day/week/month and policy selection. The SQL worker orders `(occurred_at, report_id)` under the existing transaction advisory worker lock; pending earlier submissions/matching jobs block later awards.
- Base evidence: approved, finite nonnegative numeric PM2.5, captured no more than three hours before submission, no confirmed duplicate. Severity never changes XP.

## Service and coverage

A real non-self request must be open for the measurement; the report is submitted within 15 minutes, within 2 km, with finite GPS accuracy 0–200m and location within 200m of measurement. Camera provenance or verified EXIF/time evidence is required. Automatic registered matches and preclaimed help are supported. One bonus per helper/request, one per requester/day, at most three per helper/requester over seven rolling days. Exact account IDs remain server-only.

Coverage uses predeclared public centres and a separate activation control requiring a coverage-validation reference. Search radius is 2 km for fresh Air4Thai (one hour) and eligible fresh community reports (one hour), not merely visible map pins. Announcements last 60 minutes. Matching requires outdoor, away from direct emission sources and consistent time/location evidence. The worker closes overlapping missions in the same transaction, with a 2 km/60 minute exclusion against fulfilled areas. A report can close an area while receiving only one service reward.

## Ledger, compensation and summaries

The existing append-only `community_xp_events` ledger remains authoritative: `id` is event_id, `reason` is reason_code, `reverses` links a compensating event. V3 adds a unique explicit idempotency key; report/kind, request/helper and shared day/week keys remain unique. Reversals are server-only, reasoned, once per original grant, preserve original occurrence/policy, never triggered by Dislike. Dependent bonuses reconcile from live report days, including cross-version days. Consumption of quota does not reset. Never erase historical grants or bulk recalculate legacy base XP.

Lifetime/ranks stay unchanged. Calendar-month ranking includes live earned points across versions for months at/after v3 cutover; older seasons retain their prior policy and revisions. Ranking uses shared ranks for ties and respects public opt-out. No Trust tie breaker. Frozen seasons revise for late settlement/compensation after their 72-hour provisional window.

## Release contract

V3 has an independent app flag `CONTRIBUTION_V3_ENABLED` and service-only database release control. Schema deploy leaves it off with no cutover timestamp. Target start is December 1, 2026 at 00:00 Asia/Bangkok; this is a target, not a claim it has been scheduled. The authorized server release setter requires a future Thai month boundary plus notice, concurrency, balance-preservation and real-device validation references. Coverage additionally requires a genuine coverage-validation reference. These references must describe actual evidence, not invented field testing.

A policy timestamp, once assigned, cannot move. Reports before cutover retain the old job policy even if processed afterward. After cutover, disabling v3 pauses v3 jobs instead of rerouting them to legacy awards. Restart processes those jobs idempotently. Trust release remains independent. The Admin dashboard remains read-only; there are no new HTTP score, reversal or release mutations.

## Verification / outstanding operational evidence

Pure tests, actual numeric-schema SQL tests, PostgreSQL 17 concurrency CI, API/TypeScript checks, mobile 320/360/390/430px flows and existing regressions cover the code. Database fixture tests are isolated and do not cast real votes or create fake production rewards. Physical iPhone/Android help/GPS checks and real coverage parameter evaluation remain required before enabling production v3. Browser geolocation mocks are not physical-device proof.

References supplied by the owner: [Waze points](https://support.google.com/waze/answer/6273662?hl=en), [Local Guides points](https://support.google.com/maps/answer/6225851?hl=en), [Duolingo features](https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/). These sources do not validate ClearPath's point values.

## Authorized timing update

After owner-reported completion of the mobile acceptance checklist on November 7, the owner explicitly requested immediate activation instead of the recommended month-boundary target. Immediate mode uses a server-assigned immutable start and requires the same evidence references and audit. The transition month includes actual awarded XP from all versions; no old events or ranks are reset and no retrospective grants are created. See the [release evidence](../../verification/2026-11-07-xp-v3-live-release.md).
