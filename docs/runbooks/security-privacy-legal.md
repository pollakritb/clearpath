# Security, privacy and legal public-launch gate

These items require accountable human approval and cannot be completed by an
automated coding agent.

## Evidence security

- Select and integrate a malware-scanning service for uploaded images.
- Decide whether device attestation is proportionate and supported on target
  browsers; document fallback behavior for unsupported devices.
- Commission adversarial testing for screenshots, replayed camera sessions,
  EXIF manipulation, duplicate transforms and OCR prompt/content attacks.
- Complete an external penetration test covering Auth/RBAC, service-role
  isolation, signed URLs, rate limits, RLS and cron authorization.

## Privacy

Forecast processing uses official Air4Thai observations, weather, satellite
hotspot-derived features, station metadata and generated predictions. It does
not use private community images, precise community coordinates or OCR evidence
for model training. Prediction-run telemetry has no user identity and is kept
for `FORECAST_PREDICTION_RETENTION_DAYS` (400 days by default); the hourly
evaluation cron deletes expired run batches and cascading prediction rows.
Daily aggregate evaluation and immutable model-release evidence follow the
retention period approved by the accountable owner. Any policy change requires
an additive migration/config change and a recorded privacy review.

No third-party browser analytics SDK is installed. Operational telemetry is
server-side and aggregate: route/status/duration, source, horizon and stable
alert codes only. It must never contain user identity, free-text feedback,
report images or precise coordinates. Adding an analytics vendor requires a
recorded privacy review, vendor/DPA inventory update and a regression-test
change; copying these fields into an analytics product is prohibited.

- Approve Thai consent and privacy-notice text before collection starts.
- Confirm lawful basis, controller/contact details, user rights process,
  retention periods, audit holds and deletion exceptions with qualified counsel.
- Verify the implemented 30/180-day evidence retention policy matches the
  approved policy and contractual obligations.
- Document processors/subprocessors and cross-border transfer position for
  Vercel, Supabase, OpenAI, weather/fire providers and email/push services.
- Use `vendor-dpa-inventory.md` as the source-derived register; its `Pending`
  entries must be resolved by the named privacy/legal owner before setting the
  external evidence gate to approved.
- Perform a privacy impact assessment because photos and precise GPS are
  collected even though public coordinates are obfuscated.

## Product claims and health communication

- Have a domain expert approve PM2.5 labels and health advice.
- Review every source/copy mapping in
  `health-communication-source-register.md`; collecting official links is not
  approval.
- State that ClearPath is informational, identify timestamps/source/freshness,
  and never describe a satellite hotspot as a confirmed fire.
- Do not claim forecast or interpolation accuracy beyond the published field
  evaluation.

## Human sign-off record

Record approver name, role, date, policy/document version, open exceptions and
expiry/review date for Security, Privacy/Legal, Air-quality domain, Operations
and Product. Public launch is blocked if any required approver is missing.
