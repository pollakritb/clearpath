# Pilot, automatic review and forecast model rollout

## Stage 0 — internal acceptance

- 5–10 named testers; staging only.
- Test at least one supported iPhone/Safari and Android/Chrome device.
- Cover good/poor GPS, clear/blurred display, duplicate image, screen recapture,
  indoor reading, direct emission source, clock mismatch and interrupted upload.
- Expected safety result: only high-confidence evidence may auto-approve; every
  ambiguous case remains pending and exposes neither PM2.5 nor exact location.

Record aggregate outcomes only: automatic approval rate, false approval count,
false pending count, OCR absolute error, GPS rejection rate and median flow time.
Do not export report images or exact coordinates into analytics.

Stop automatic review immediately if any false approval exposes an incorrect
value, a duplicate bypasses detection, or exact evidence becomes public.

## Stage 1 — closed community pilot

- 25–50 consented users for at least two weeks.
- Start `AUTOMATIC_REVIEW_ENABLED=false`; manually label enough representative
  evidence to calculate OCR/policy precision.
- Enable automatic review for 10% of eligible high-confidence cases, then 25%,
  50% and 100% only when the previous cohort has zero critical privacy failures
  and meets the approved precision target.
- Keep Air4Thai under one hour/5 km as primary and community as supplementary.

## Forecast data collection

Keep `ML_FORECAST_ENABLED=false` while the hourly cron accumulates official PM,
weather and fire features. The activation gate requires at least:

- 90 days and 1,500 usable examples;
- 300 temporal holdout examples;
- 3 stations and 6 distinct observed months;
- at least 80% completeness;
- per-station temporal holdout (no random future leakage);
- model MAE at least 5% better than persistence;
- category accuracy no more than two percentage points below baseline.

Export read-only training data and train locally:

```powershell
.venv\Scripts\python -m scripts.export_forecast_training --since 2026-01-01T00:00:00Z --output data/forecast_training.csv
.venv\Scripts\python -m scripts.train_forecast data/forecast_training.csv
.venv\Scripts\python -m scripts.register_forecast_models
```

The registration command without `--apply` is a review-only dry run. It exits
non-zero if any horizon fails its gate. Review artifact metrics and SHA in a
change record, then register candidates:

```powershell
.venv\Scripts\python -m scripts.register_forecast_models --apply
```

Registration does not itself enable inference. Deploy artifacts, confirm Admin
shows all intended horizons gated, then set `ML_FORECAST_ENABLED=true` first in
staging. Compare shadow predictions for at least 14 days before production.

## Production model rollback

Turn `ML_FORECAST_ENABLED=false` and redeploy. The API will report its fallback
reason and use the baseline. Preserve the failed artifact/metrics for audit;
never silently replace it under the same version.

## Multi-season completion

The product is evidence-mature only after dry- and wet-season field evaluation,
district-level error reporting, sparse-area analysis, and a documented decision
about whether the deployed IDW parameters remain acceptable. Kriging stays a
development/evaluation dependency and is not deployed to the Vercel function.
