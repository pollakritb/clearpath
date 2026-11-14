# LINE alerts: exclude the recipient's own reports

Local fix prepared November 14, 2026. The owner subsequently authorized testing,
commit, push and deployment. The release adds two read-only RPCs before deploying
the caller; it does not directly reset state/queues, replay messages or manually
send LINE tests. Scheduled workers apply evidence-bound repair through their
normal CAS flow after deployment.

## Confirmed issue

The existing candidate SQL picked a nearby self-authored 38 reading before a
fresh, approved 55 reading by another account. The self alert also consumed the
warning episode. Excluding the winning row after SQL LIMIT 1 would still lose the
other report, so exclusion must happen before ranking/limiting.

## Release verification

- Full Python suite: 3,760 passed, zero failures/errors/skips.
- Isolated SQL tests: own 38 excluded before nearest LIMIT; other 55 selected;
  ownership depends on recipient; unknown recipient fails closed; valid other-user
  episodes preserved; evidence timestamp and RPC grants enforced.
- Existing LINE delivery and 1,000-case SQL candidate matrix passed.
- Additive production migration `20261114074426` applied after encrypted metadata
  backup/decryption verification. Both new RPCs are invoker functions, executable
  only by service_role (not anon/authenticated). Approximate DB delta: 32 KiB.
- No direct queue/state reset or manual LINE send was performed. Deployment and
  the normal scheduled worker provide the application cutover; human receipt is
  not certified by provider acceptance.

## Implementation

- New service-only `air_alert_candidates_for_user` RPC filters report ownership
  before nearest-source ranking. Official stations remain eligible. Unknown
  recipient identity fails closed; public/private coordinates policy is unchanged.
- Worker selection supplies its authenticated internal profile identity, resolved
  by IdentifierClient. Local demo selection follows the same exclusion rule.
- Existing own-report deliveries are rechecked against timestamp-matching sent
  outbox evidence. Only an episode proved to originate from the recipient's own
  report is cleared. Valid other-user episodes, pending fencing and notification
  history are preserved. A policy marker avoids an extra read per worker poll.
- Existing pending self alerts fail delivery eligibility after the new selection
  is active. The existing fenced outbox completion/rollback resolves them; never
  reset pending rows or generate new retry keys by hand.
- New text messages separate value, saved threshold, source, approximate distance,
  Thai source time, advice and the source URL. No exact GPS or identity is included.
  Frozen requests already attempted must retain their old body/key on retry.

Example layout:

```text
ค่าฝุ่นถึงเกณฑ์แจ้งเตือน · PM2.5 55 µg/m³
เกณฑ์ที่คุณตั้งไว้: 37.6 µg/m³ ขึ้นไป
แหล่งข้อมูล: รายงานชุมชน
ระยะห่าง: ประมาณ 230 เมตร จาก GPS ล่าสุดของคุณ
วัดเมื่อ: 14/11/2026 14:03 น. (เวลาไทย)

คำแนะนำ: [existing advice for the PM2.5 level]
ข้อมูลชุมชนเป็นข้อมูลเสริม ไม่ใช่ค่าจากสถานีทางการ
[source URL]
```

## Several reports without notification flooding

The current nearest-pin policy remains: choose the nearest eligible other-user
report or official station, then compare its value to the threshold. A farther
high reading does not replace a nearer low reading. Multiple new reports at the
same warning level do not each send a message or reset an episode. Escalation to
PM2.5 >75 sends another alert; recovery requires 30 minutes below threshold and
ordinary re-entry still respects the 60-minute pause. These are experimental
product rules, not claims about scientific health cutoffs.

This fix intentionally does not add a per-report notification stream, repeated
same-level reminders or a scheduled digest. Those require separate preference,
consent and provider-quota decisions. Own-report exclusion applies regardless.

## Release gate for the main conversation

1. Review the additive `exclude_self_air_alerts` migration and take appropriate
   recovery evidence under the existing database release workflow.
2. The migration is additive and preserves the old RPC for rolling compatibility.
   Do not interrupt valid pending leases, change the authorized hosting trial
   deadline, extend the trial or enable paid capacity.
3. Apply the new read-only RPC definitions before deploying their Python caller.
   There is no silent fallback to the old unscoped candidate function.
4. Deploy the worker/application and resume the existing authorized schedule.
   Evaluate current data through normal CAS/lease machinery. No direct blanket
   reset of episodes, history, queues or sent rows is required.
5. For an explicitly authorized canary, verify one fresh eligible other-user
   alert and zero self alerts. Provider acceptance is not a human-read receipt.

## Isolated checks

```sh
.venv/bin/python -m pytest backend/tests/test_self_air_alerts.py backend/tests/test_nearest_air_alert.py backend/tests/test_line_1000_cases.py backend/tests/test_line_delivery_allowlist.py
node scripts/test-self-air-alerts.mjs
```

SQL checks cover exclusion before LIMIT, recipient-dependent ownership, unknown
recipient, timestamp-bound repair evidence, preservation of valid other-user
warnings and anon/authenticated denial. No Supabase or LINE connection is used.
