# Forecast provider operations

This runbook is the production source of truth for external PM2.5 forecasts.
ClearPath shows one recommended raw provider value and lets a user compare no
more than three sources. Community readings are presented separately and do not
silently replace a provider value.

## Provider policy

| Provider                  |      Product horizon |           Sync | Required configuration                                       | Production status                                                     |
| ------------------------- | -------------------: | -------------: | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| GISTDA ChekFoon           |            1–3 hours |  every 3 hours | `GISTDA_AIR_ENABLED=true` and `GISTDA_LICENSE_APPROVED=true` | Fail closed until written reuse/public-display permission is recorded |
| CAMS via Open-Meteo       | 1–24 hours displayed | every 12 hours | `OPENMETEO_AIR_ENABLED=true`                                 | Default no-key provider; attribute CAMS and Open-Meteo                |
| OpenWeather Air Pollution | 1–24 hours displayed |  every 8 hours | `OPENWEATHER_AIR_ENABLED=true` and `OPENWEATHER_API_KEY`     | Optional second provider on the free entitlement                      |

The selection order is GISTDA, CAMS/Open-Meteo, then OpenWeather. This is a
published deterministic policy, not an accuracy claim. A provider's raw PM2.5
value is never averaged or overwritten. Agreement and the uncertainty envelope
are comparison metadata only. A provider is rejected after its source-specific
freshness window: 5 hours for GISTDA, 14 hours for CAMS/Open-Meteo and 10 hours
for OpenWeather.

## Community evidence

Only approved reports no older than three hours with Trust at least 60, GPS
accuracy at most 200 metres, no duplicate image and no direct emission-source
warning are candidates. They also require either two independent corroborating
reporters or Trust at least 80 with a calibrated device. Haversine distance is
used within a 5 km forecast context.

The production default is `COMMUNITY_FORECAST_SHADOW_ENABLED=false`. Eligible
community evidence is shown separately to users. Enabling shadow mode records
its residual and effective sample size but still does not alter the recommended
provider value. Serving a correction requires the field-validation and rolling
backtest gates in `forecast-field-validation.md`; there is intentionally no
browser or environment switch that bypasses those gates.

## Free-tier scheduler

Vercel Hobby has no hourly cron dependency in this project. GitHub Actions runs
`.github/workflows/production-scheduler.yml` at minute 7 every hour and calls
protected backend routes. Configure only these repository values:

1. Actions variable `CLEARPATH_PRODUCTION_URL` = the production HTTPS origin,
   without a trailing slash.
2. Actions secret `CRON_SECRET` = exactly the same random value as the Vercel
   Production environment variable.
3. Vercel `OPENWEATHER_API_KEY` when OpenWeather is enabled.
4. Leave both GISTDA flags false until the permission evidence below exists.

Run the workflow manually once. Air4Thai sync, alerts and forecast evaluation
must return 2xx. Every hourly invocation also calls each provider route with
`only_if_due=true`; the backend compares the last completed provider run with
its 3/8/12-hour interval. This is deliberately independent of the wall-clock
hour because GitHub scheduled workflows can start late. Provider routes are
also idempotent through snapshot upsert keys.

## GISTDA legal gate

The GISTDA Open Data catalogue currently exposes the dataset/API but does not
state an explicit licence for caching and republication. Before enabling it:

1. Obtain written permission covering automated calls, caching, public display,
   attribution and retention of forecast snapshots.
2. Save the approval reference and accountable owner in the organisation's
   legal register; never commit private correspondence or credentials.
3. Apply `supabase/migrations/20260904_forecast_gistda_provider.sql` to the
   ClearPath Supabase project only.
4. Set both GISTDA flags to true in Vercel Production and redeploy.
5. Run `/api/cron/forecast-providers/gistda` through the protected scheduler.
6. Confirm Admin shows a successful run and the public API exposes GISTDA
   attribution before considering the provider active.

If permission is refused, keep the flags false. The UI continues with the other
providers and shows GISTDA as unavailable without making external requests.

## Acceptance checks

- A stale local Air4Thai history must not suppress a fresh external forecast.
- One external source yields `limited`; two simultaneously comparable sources
  across the requested horizon yield `available` only when their agreement is
  not low. Large disagreement remains visible and yields `limited`.
- No usable external source uses a fresh ClearPath local fallback; if both are
  unusable the response is `unavailable` and the UI hides the number.
- The response and mobile UI expose at most three external providers, issue
  times, attribution links, agreement and limitations.
- Community evidence states explicitly whether it affects the recommendation.
- Admin provider health shows sync count, failures and last completion time.
- Hourly evaluation removes provider snapshots older than 7 days and completed
  sync runs older than 30 days to protect the Supabase free-tier database.
