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

Contract reviewed against provider documentation on 2026-09-16:

- CAMS Global through Open-Meteo is global, about 45 km, natively 3-hourly,
  updated every 12 hours and provides five forecast days. ClearPath requests
  four days and exposes only 1/3/6/12/24 hours. `pm2_5` is an instantaneous
  concentration in `µg/m³`; timestamps are requested in UTC. The response does
  not expose the underlying model-run issue time, so ClearPath labels its stored
  `issued_at` truthfully as retrieval time. Attribution must name both CAMS
  ENSEMBLE and Open-Meteo. API data is CC BY 4.0, while the free hosted endpoint
  is restricted to non-commercial use and its published call limits. Sources:
  <https://open-meteo.com/en/docs/air-quality-api> and
  <https://open-meteo.com/en/terms>.
- OpenWeather Air Pollution returns a four-day, hourly forecast by WGS84
  coordinate and PM2.5 in `µg/m³`. Forecast timestamps are Unix UTC. It does not
  provide a model-run issue timestamp in this response, so ClearPath also labels
  retrieval time rather than claiming model issuance. Use is tied to the active
  OpenWeather subscription/terms; do not infer a Creative Commons licence.
  Source: <https://openweathermap.org/api/air-pollution>.
- GISTDA remains disabled. Its horizon and response adapter are not approval to
  cache or publicly redistribute the result; written permission is still a hard
  gate.

The recommended source is selected from a rolling 14-day evidence window after
at least 30 settled comparisons against Air4Thai observations. MAE is primary;
false-safe rate and absolute bias are bounded safety tie-breakers. Evidence
expires 36 hours after its latest computation. When no provider has eligible
evidence, ClearPath selects the freshest usable snapshot without brand priority
and marks the result limited. A provider's raw PM2.5 value is never averaged or
overwritten. Agreement and the uncertainty envelope are comparison metadata
only. A provider is rejected after its source-specific freshness window: 5
hours for GISTDA, 14 hours for CAMS/Open-Meteo and 10 hours for OpenWeather.
Provider evidence ledgers are created in batch by the protected provider-sync
cron for every station and product horizon present in the normalized snapshot.
They are not created by public forecast requests, so provider ranking is not
biased toward stations with more ClearPath page views.

Provider requests use bounded timeouts and retry only timeouts, network errors,
HTTP 429 and HTTP 5xx. A recent failed sync opens a 60-minute circuit; public
forecast reads continue from still-fresh database snapshots. Browser requests
never call a provider directly.

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

## Free-tier schedulers

Vercel Hobby has no sub-hourly cron dependency in this project. Supabase Cron
is the primary Air4Thai observation scheduler and invokes `/api/cron/sync` at
minutes 2, 17, 32 and 47 of every hour. GitHub Actions remains an independent
twice-hourly backup at minutes 7 and 37 and also runs alerts, evaluation and
due forecast providers.

Supabase configuration:

1. In the ClearPath project Vault, add `clearpath_production_url` with the
   production HTTPS origin and no path.
2. Add `clearpath_supabase_cron_secret` with an independent random value of at
   least 32 characters.
3. Add the same value to Vercel Production as `SUPABASE_CRON_SECRET`.
4. Apply `supabase/migrations/20260910_supabase_air4thai_cron.sql` to the
   ClearPath project only, then redeploy Vercel.

GitHub backup configuration:

1. Actions variable `CLEARPATH_PRODUCTION_URL` = the production HTTPS origin,
   without a trailing slash.
2. Actions secret `CRON_SECRET` = exactly the same random value as the Vercel
   Production environment variable.
3. Vercel `OPENWEATHER_API_KEY` when OpenWeather is enabled.
4. Leave both GISTDA flags false until the permission evidence below exists.

Run the backup workflow manually once. Air4Thai sync, alerts and forecast
evaluation must return 2xx. Every backup invocation also calls each
provider route with
`only_if_due=true`; the backend compares the last completed provider run with
its 3/8/12-hour interval. This is deliberately independent of the wall-clock
hour because GitHub scheduled workflows can start late. Provider routes are
also idempotent through snapshot upsert keys. A due, enabled provider that
produces no usable snapshots returns a non-2xx response so the workflow cannot
report a false success.

The backend records scheduler identity without storing either bearer token:
`air4thai_supabase_primary` for Supabase Cron and
`air4thai_github_backup` for GitHub Actions. Admin data health raises
`primary_cron_missed` when no primary invocation is observed for 45 minutes,
even when the backup keeps station data fresh. This prevents a working backup
from hiding a failed primary scheduler.

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
- Hourly backup evaluation removes provider snapshots older than 7 days and completed
  sync runs older than 30 days to protect the Supabase free-tier database.
