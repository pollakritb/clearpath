# Contribution v3 implementation verification

## Implemented

V3 preserves existing balances/ranks and adds the 10/5/20 award policy, 70/90 daily ceilings, server-submission policy/day assignment, shared cross-version quotas/cooldown/week keys, bonus-only service awards, deterministic contested-mission ordering, explicit idempotency, reasoned reversals/dependent compensation, monthly rankings/revisions and mobile rules/quota explanations. It does not connect XP to Trust, publication or IDW.

Schema compatibility is tested for both existing v2 and legacy production schemas. Original applied migrations stay immutable; the additive prerequisite migration installs missing dormant structures without enabling v2. No reset or historical base-XP backfill is used. Only authorized server operations can release/pause/reverse; Admin remains read-only.

## Validation evidence

- Backend: **583 tests pass**, coverage **81.63%** (80% gate).
- Frontend: **385 tests pass**, function coverage **90.75%**.
- Mobile Chromium: **230 pass / 6 intentional viewport skips**, 320/360/390/430px. Includes v3 profile/rules/quota views, existing accessibility/touch sheets, Trust/report and submission flows.
- Ruff, ESLint, TypeScript, Prettier and production build pass. Visual checks reviewed the v3 320px/390px browser artifacts.
- Numeric-schema SQL tests cover base/service/day/week awards, shared caps, service-only reports, pair limits, overlapping missions, delayed older matching, retry, rollback/pause, cross-version monthly scores and dependent reversal/compensation.
- Actual PostgreSQL 17 CI: [legacy schema without v2](https://github.com/pollakritb/clearpath/actions/runs/42382731278/job/128433589311), [existing v2 schema](https://github.com/pollakritb/clearpath/actions/runs/42382731278/job/128433589112). Both passed concurrent submissions/workers, deterministic ties and job order, single first-day bonus, contested mission ordering and concurrent reversal uniqueness. Trust concurrency also passed independently.

## Production schema receipt

On November 7, the additive prerequisite and v3 migrations were applied with before/after ledger/account preservation assertions inside each transaction. The first attempt safely rolled back because the fingerprint counted newly added null metadata keys; the comparison was corrected to normalize null JSON keys, and the original data was verified intact before retry. The subsequent applications passed preservation assertions.

After migration, production retained **15 XP events / 115 total live XP / 6 accounts / 11 reports / 0 Trust events**, matching the pre-migration aggregate baseline. Browser roles cannot invoke release or reversal; both new control/audit tables have RLS. No synthetic production rewards or votes were created.

## Release state and remaining gates

At schema deployment, `enabled=false`, `starts_at=null`, `missions_enabled=false`; no v3 release date has been scheduled. The target month boundary is December 1, 2026, 00:00 Asia/Bangkok, subject to actual readiness. Existing XP continues under its old policy.

Physical iPhone/Android GPS/permission/camera/gallery and help-request flow validation is still outstanding. Real coverage input/parameter evaluation is also outstanding; isolated PostgreSQL tests are staging-like test evidence, not a completed live Supabase/user field trial. Do not claim these gates passed or invent their reference values. Browser mocks and synthesized touch are not physical-device proof.

Use the [runbook](../runbooks/contribution-v3.md) for release evidence, independent app flag, immutable month boundary, pause/resume and reconciliation. Enabling general production v3 or coverage bonuses is a separate operational step once those gates are met.

The follow-up migration was also applied to production with preservation assertions passing and the release still disabled. It aligns v3 coverage bonuses with the same camera/verified-time/GPS protocol used for request-service bonuses. It does not require retired OCR field/unit flags in addition to number-only publication; legacy v2 rules remain unchanged. SQL and PostgreSQL mission tests explicitly run with those flags false. Fresh eligible v3 reports suppress coverage tasks using that same provenance/15-minute protocol.
