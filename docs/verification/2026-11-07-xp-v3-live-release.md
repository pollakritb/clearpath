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
