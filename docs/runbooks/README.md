# ClearPath operations runbooks

- [Production deployment](production-deployment.md) — Supabase, secrets, Vercel,
  cron and acceptance checks.
- [Backup and restore](backup-restore.md) — mandatory rehearsal before the
  destructive foundation migration.
- [Incident response](incident-response.md) — alerts, triage, feature kill
  switches and rollback.
- [Pilot and model rollout](pilot-and-model-rollout.md) — field validation,
  auto-review and ML gates.
- [Forecast ownership and decision log](forecast-ownership-decisions.md) —
  accountable owners, release evidence and approval record templates.
- [Forecast field validation protocol](forecast-field-validation.md) —
  co-location, seasonal sampling, privacy and community inclusion gates.
- [Forecast provider operations](forecast-providers.md) — source selection,
  freshness, attribution, free-tier scheduling and the GISTDA legal gate.
- [External evidence template](forecast-external-evidence.example.json) —
  non-secret machine-checkable inputs for every FCAST task that requires an
  owner, live environment, elapsed observation window or human approval.
- [Security, privacy and legal launch gate](security-privacy-legal.md) — work
  that requires accountable human approval.
- [Vendor/DPA inventory](vendor-dpa-inventory.md) — source-derived processor,
  provider, data-flow and legal-review register.
- [Health source register](health-communication-source-register.md) — candidate
  official Thai sources and exact-copy approval procedure.

The executable checks are intentionally read-only unless their command includes
an explicit `--apply` flag.
