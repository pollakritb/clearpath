# Incident response

## Alert conditions

Page the on-call owner when any condition occurs:

- `/api/ready` is non-200 twice within five minutes;
- no successful Air4Thai sync for 90 minutes;
- fresh service-area station count is zero;
- production 5xx rate exceeds 2% for five minutes;
- OCR failures or automatic-review disagreement rise above the pilot baseline;
- a report is suspected of exposing exact coordinates or a private image;
- notification outbox failures persist for 30 minutes;
- an Admin account or service key may be compromised.

## First 15 minutes

1. Record start time, reporter, release SHA and request IDs. Do not paste tokens,
   report images or exact coordinates into the incident channel.
2. Check Vercel runtime logs using request ID and Supabase service status.
3. Run `scripts.verify_deployment` and inspect Admin sync/outbox/model status.
4. Contain with the narrowest feature flag:
   - `AUTOMATIC_REVIEW_ENABLED=false` — all uncertain reports remain pending;
   - `PUSH_ENABLED=false` — stop delivery while keeping preferences;
   - `ML_FORECAST_ENABLED=false` — return to explainable baseline;
   - disable Vercel cron temporarily if it is damaging data.
5. Redeploy after a Vercel environment change; old deployments do not receive
   new values.

## Privacy/security incident

1. Disable affected evidence access and rotate the service-role, capture, cron,
   VAPID and OpenAI keys as applicable.
2. Revoke suspicious Auth sessions and remove compromised Admin roles.
3. Preserve audit logs and affected evidence under audit hold. Do not run normal
   retention deletion on evidence required for investigation.
4. Determine whether legal/regulatory notification is required with the data
   protection owner. Engineering must not make that legal decision alone.

## Rollback

Use Vercel Instant Rollback or redeploy the last known good SHA for application
code. After an Instant Rollback, verify cron configuration separately because
active cron jobs do not automatically follow the rolled-back deployment.

Database changes are forward-only: create a corrective migration. Do not edit an
already-applied migration and do not use a remote reset. Restore from backup only
under the approved disaster-recovery decision.

## Closure

Close only after readiness is stable, one complete report flow passes, no
privacy leak remains, alerts are restored, and the timeline/root cause/follow-up
owners are documented. Add a regression test for every reproducible defect.
