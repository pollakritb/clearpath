# LINE automatic-notification policy

Automatic LINE messages are limited to three events:

| Event                   | Recipient and eligibility                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `measurement_request`   | Eligible participating helper; open request/group, not declined, linked LINE, consent and channel enabled                                     |
| `measurement_fulfilled` | Request owner only, really fulfilled, notification lifetime not expired, linked LINE, consent and channel enabled                             |
| `air_alert`             | Air4Thai PM2.5 at or above the saved threshold, within the saved radius, valid finite measurement/source time, existing 90-minute alert limit |

Report status, expired requests, hotspots, rank/reward/rating, leaderboard,
announcement and unknown events never enter automatic LINE delivery. This is a
LINE-channel policy. Existing in-app notifications and audit history remain.
Legacy API preference fields remain compatible with in-app history; enabling
them cannot bypass the LINE allowlist. UI shows the three supported categories,
a PM2.5 switch, global LINE/consent and quiet hours. Request invitations depend
on helper participation/area; fulfilled messages apply to the owner's request.

## Creation and pending messages

New jobs include event type and air-source context. Expired requests no longer
create LINE jobs. Existing SQL-generated groups are identified by structured
group metadata. The existing two-minute delivery lease is reused for all
outbox jobs so concurrent workers do not send the same claimed row. No schema
migration is required.

Before sending, the worker checks the allowlist again. Legacy jobs use only
known structured metadata/tags, never message text. Unknown, removed or
incomplete jobs become terminal `dead` with a reason code. Old PM2.5 jobs lacking
source context are cancelled rather than replayed blindly. History is not
rewritten or deleted.

Consent, LINE enablement, request/group state and PM2.5 preferences are checked
again. Quiet hours defer without consuming a provider attempt. Old air readings
are cancelled after a quiet window; closed/declined requests and expired
fulfillment messages are cancelled. Missing coordinates do not mean nationwide
alerts. Zero thresholds work. Map and Place IDW policies remain unchanged.

## Delivery results and retries

`sent` means LINE accepted the request, not that a person received/read it.
Zero delivery counts (missing link or opt-out) become `dead`, never `sent`.
Provider/configuration failures retry with a stable UUID key. Valid existing
keys are preserved; numeric legacy keys become deterministic UUIDs. A 409 is
accepted only with `x-line-accepted-request-id`. Terminal payloads are redacted;
cancellation reason codes distinguish policy changes from provider failures.
Historical `sent` records are not retroactively reclassified.

Workers have a 20-second soft budget; an in-flight provider call may finish
later. After restart/ambiguous failure, retry uses the same key. LINE manages
keys for 24 hours; this does not guarantee exactly-once receipt by a person.
Connection replies and authenticated test buttons are explicit user actions,
separate from automatic notifications. Local tests mock LINE responses and do
not message real accounts.

## Verification and rollout

Test policy/service/LINE-security cases, frontend, lint, typecheck, format and
build. Check mobile settings at 320/360/390/430px; linked/unlinked and load-error
states; removed pending jobs; opt-out; quiet hours; stale air readings; changed
threshold/area; missing links; provider retry; duplicate workers; closed groups.

After deployment, verify server configuration and the minute-based outbox
scheduler. A real LINE
test requires an explicitly selected, consenting recipient. Queue state alone
is not proof of receipt.

Reference: [LINE retry guidance](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/).
