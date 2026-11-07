# XP contribution-v3 production release evidence

## Owner acceptance and timing

The project owner reported completing all requested mobile checks successfully in this session: GPS, camera, gallery/OCR, real reporting, helping another account's request, map sheets, Community Trust assessment/withdrawal and preserved profile points. This is **owner-reported acceptance**, not an automated certification. The agent directly observed the production Safari session through iPhone Mirroring and the camera permission prompt; the owner completed the remaining physical checks. No Android model/version was supplied, so do not claim an independently observed Android test.

After acceptance the owner explicitly selected **open immediately today**, replacing the recommended December 1 month-boundary target. The release function now supports an explicit immediate mode with a recorded reason and server-generated initial timestamp. Existing evidence requirements, service-role-only execution, worker lock, immutable cutover, pause/resume and release audit remain enforced. No backdated start can be supplied through immediate mode.

Monthly ranking includes actual awarded events from all versions in the transition month. Existing events and balances are not rewritten or granted again; jobs submitted before cutover retain their original policy.

## Initial real-input coverage evaluation

Read-only production snapshot: **2026-11-07 23:19:19 Asia/Bangkok**, **177 stations**. Public, predeclared area centres were evaluated against current station readings and server-side aggregate community eligibility; no private report coordinates or account IDs are included here.

| Area           | Nearest station km | Fresh stations in 2 km | Fresh stations in 5 km | Eligible fresh reports in 2 km | Candidate |
| -------------- | -----------------: | ---------------------: | ---------------------: | -----------------------------: | --------- |
| ตัวเมืองนครปฐม |              2.424 |                      0 |                      0 |                              0 | Yes       |
| กำแพงแสน       |             22.999 |                      0 |                      0 |                              0 | Yes       |
| สามพราน        |             11.024 |                      0 |                      0 |                              0 | Yes       |

The production pure-function decision matched an independent distance/freshness calculation for all three centres. The 2 km policy was compared with 5 km on these inputs; both found no fresh stations in the areas at this snapshot. Stale station presence does not suppress an eligible mission. Each mission is preannounced for 60 minutes, requires outdoor/service evidence, and is closed transactionally with the existing overlap and shared-service quota protections.

This is an initial operational data evaluation, not a scientific validation of the radius or proof of field conditions. Monitor repeat missions, stale-source-driven candidates, legitimate help blocked by quotas and geographical participation after launch. Keep source freshness visible; no missing map pin alone establishes a gap. Parameter changes require a new policy version and notice.

## Release evidence references

- Notice and rules: `docs/superpowers/specs/2026-11-07-contribution-v3.md` plus this explicit timing update.
- Previous complete audit: `docs/verification/2026-11-07-xp-v3-recheck.md`.
- Device acceptance: owner confirmation “เทสครบใช้งานได้” in this session, with the observation limits above.
- Coverage evaluation: the timestamped real-input snapshot above.
- Immediate-release SQL tests check missing reason/evidence rejection, server timestamp, retry immutability, audit events, role isolation and transition-month totals. PostgreSQL CI runs the new migration on both legacy and v2 foundations.

The historical audit reports describe their own disabled release state; this newer release record supersedes that state once the authorized operation succeeds. Old-version cleanup is deferred until the current release is confirmed operational, as instructed by the owner.

## Production activation receipt

Production release `e9b2bf3770dd1375bc22fa86daef5e1f532cf539` was verified before activation. Server-assigned cutover: **2026-11-07 23:24:04.540260 Asia/Bangkok**. XP v3 is enabled, not paused, and coverage missions are enabled. Community Trust remains collecting/public with 365-day retention.

The activation transaction passed ledger/account fingerprint assertions. At that point production contained **17 XP events / 125 live XP / 6 XP accounts / 13 reports**; the increase from the earlier 15/115/11 baseline was already present before activation after owner testing. Activation itself created no reward or reset. Three eligible public missions were published at 23:24:45 with 60-minute expiry. The live monthly leaderboard returned the new start timestamp, the missions API returned all three +5 tasks, and a public profile returned the current Community Trust state. Health/readiness and security smoke passed.

## Superseded runtime cleanup

After live release verification, the independent reporter-score algorithm/service/cards/endpoints and old star/gratitude writer were retired, along with the old v2 activation and independent-score import commands. Current Community Trust review intake has its own contract. Historical migration files, stored audits, XP events and the settlement/read helpers still required for old submissions, cross-version quotas and lifetime totals remain. Historical audit-schema privacy tests are retained under the name `test-legacy-audit-retention.mjs`; they do not activate an old score.

Cleanup validation: **565 backend tests pass**, coverage **81.27%**; **386 frontend tests pass**, function coverage **91.19%**. Retired-feature tests were removed with their implementations, and the API-surface regression now asserts old endpoints/models are absent and current Community Trust remains present. The retained historical audit SQL privacy suite passes. Ruff, TypeScript, ESLint and formatting checks pass.
