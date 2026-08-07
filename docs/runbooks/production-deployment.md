# Production deployment

This sequence keeps community evidence private and prevents a green deployment
from being mistaken for a healthy data pipeline.

## 1. Accounts and plan

1. Use separate Supabase projects for staging and production.
2. Vercel Hobby is supported. `vercel.json` intentionally contains no Vercel
   cron entries because Hobby permits each cron only once per day. The
   `.github/workflows/production-scheduler.yml` workflow invokes the protected
   production endpoints hourly instead. Monitor GitHub Actions usage when the
   repository is private; public repositories use standard runners for free.
3. Give production access only to named owners. Enable MFA on GitHub, Vercel,
   Supabase, OpenAI and the email provider.

## 2. Generate independent secrets

Generate each secret separately and store it in a password manager. Never paste
secret values into an issue, chat, screenshot or Git commit.

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Run the snippet twice: once for `CRON_SECRET` and once for
`CAPTURE_SESSION_SECRET`. They must not match and must not reuse the Supabase
service-role key.

Generate VAPID keys only on a trusted workstation:

```powershell
npx web-push generate-vapid-keys
```

Store the private key server-side. `VAPID_PUBLIC_KEY` may be exposed to the
browser.

## 3. Prepare Supabase staging

1. Create/select the staging project and copy its project reference from the
   Dashboard URL.
2. Install/login/link the CLI:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <STAGING_PROJECT_REF>
   npx supabase migration list
   ```

3. Inspect destructive SQL before doing anything to the remote database:

   ```powershell
   .venv\Scripts\python -m scripts.migration_guard supabase/migrations/20260717_production_foundation.sql supabase/migrations/20260722_tor_alignment.sql supabase/migrations/20260803_forecast_production_hardening.sql supabase/migrations/20260804_nationwide_forecast_consensus.sql
   ```

4. `20260717_production_foundation.sql` is expected to be blocked because it
   resets pre-production community tables and `report-images`. Apply it only to
   an empty staging project, or after completing the backup/restore runbook.
5. Preview, then apply pending migrations:

   ```powershell
   npx supabase db push --dry-run
   npx supabase db push
   ```

6. In Storage, verify bucket `report-images` is **Private**, limited to JPEG,
   PNG and WebP, and limited to 8 MB. The browser must have no policy that lists
   or reads all report evidence. The backend uses service-role access and issues
   short-lived signed URLs only to authorized Admin flows.
7. In Authentication → URL Configuration set the exact staging Site URL and
   allowed redirect URL. Repeat later using the exact production URL; avoid a
   broad production wildcard.
8. Create the first Admin account normally through Auth, then change only its
   `profiles.role` to `admin` in the SQL editor. Do not put role claims supplied
   by the browser in charge of authorization.

## 4. Configure environment variables

Required in both Vercel Preview and Production unless marked optional:

| Variable                            | Source / rule                                             |
| ----------------------------------- | --------------------------------------------------------- |
| `APP_ENVIRONMENT`                   | `staging` for Preview; `production` for Production        |
| `RELEASE_SHA`                       | Git commit SHA; CI or Vercel system value                 |
| `SUPABASE_URL`                      | Supabase project URL, server runtime                      |
| `SUPABASE_SERVICE_ROLE_KEY`         | Server only; never `NEXT_PUBLIC_*`                        |
| `NEXT_PUBLIC_SUPABASE_URL`          | Same project URL, browser build                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Publishable/anon browser key                              |
| `REPORT_IMAGE_BUCKET`               | `report-images`                                           |
| `CRON_SECRET`                       | Independent random secret, at least 32 characters         |
| `CAPTURE_SESSION_SECRET`            | Different independent random secret                       |
| `CORS_ALLOWED_ORIGINS`              | Exact HTTPS origin, no `*`                                |
| `OPENWEATHER_API_KEY`               | Server only; required while its provider flag is enabled  |
| `FIRMS_MAP_KEY`                     | Server only                                               |
| `OPENAI_API_KEY`                    | Required before enabling real automatic review            |
| `AUTOMATIC_REVIEW_ENABLED`          | Start `false` in staging until evidence acceptance passes |
| `PUSH_ENABLED`                      | Start `false`; enable after VAPID delivery test           |
| `VAPID_*`                           | Required when push is enabled                             |
| `ML_FORECAST_ENABLED`               | Keep `false` until every artifact gate passes             |
| `COMMUNITY_FORECAST_SHADOW_ENABLED` | Keep `false` at launch; no public forecast influence      |

For each variable, let `vercel env add` prompt for the value so it does not
appear in terminal history:

```powershell
vercel link
vercel env add SUPABASE_URL preview
vercel env add SUPABASE_URL production
vercel env ls
```

Changing an environment variable affects only new deployments, so redeploy
after any change.

## 5. Preflight and preview deployment

Populate `.env.local` with staging values, then run:

```powershell
.venv\Scripts\python -m scripts.production_preflight --strict-features
npm run audit:prod
npm run format:check
npm run lint
npm run typecheck
npm run test:unit:coverage
.venv\Scripts\python -m ruff format --check backend api scripts
.venv\Scripts\python -m ruff check backend api scripts
.venv\Scripts\python -m pytest --cov=backend --cov-fail-under=75
npm run build
vercel deploy
```

The preflight output must show every required table as `true`. It never prints
secret values. If it reports `ConnectError`, verify that the Supabase project is
running, the URL belongs to that project, DNS/TLS is reachable from the build
environment, and keys were copied without quotes or whitespace.

After the preview URL is available:

```powershell
.venv\Scripts\python -m scripts.verify_deployment https://<PREVIEW_HOST>
.venv\Scripts\python scripts\measure_forecast_runtime.py https://<PREVIEW_HOST> --requests 30
vercel logs --deployment https://<PREVIEW_HOST> --level error
```

Keep the aggregate runtime JSON with its UTC window. It measures client-visible
availability, fallback rate, response size, and p50/p95/p99 latency without
storing station IDs or response bodies. Correlate that same UTC window with the
Vercel dashboard for function memory, invocation errors, and cost; the sampler
cannot replace provider-side memory or billing evidence.

Export a representative JSONL operational-log window without request bodies,
then run the local privacy scanner. Its report contains line numbers and finding
codes only; it does not echo leaked values:

```powershell
.venv\Scripts\python scripts\audit_operational_logs.py operational-logs-preview.jsonl
```

Before recording any external FCAST task as complete, update the gitignored
evidence file and require `ready=true`:

```powershell
Copy-Item docs\runbooks\forecast-external-evidence.example.json forecast-external-evidence.json
.venv\Scripts\python scripts\forecast_external_evidence.py forecast-external-evidence.json
```

Preview acceptance also requires a real OTP login, camera/GPS capture on one
iPhone and one Android device, pending fail-closed behavior, Admin role denial
for normal users, signed-image expiry, and a test push notification.

## 6. Production and scheduler acceptance

Deploy only after preview acceptance and a recorded backup:

```powershell
vercel deploy --prod
.venv\Scripts\python -m scripts.verify_deployment https://<PRODUCTION_HOST>
.venv\Scripts\python scripts\measure_forecast_runtime.py https://<PRODUCTION_HOST> --requests 30
vercel logs --environment production --level error --since 5m
```

Then configure GitHub → repository Settings → Secrets and variables → Actions:

1. Add repository variable `CLEARPATH_PRODUCTION_URL` with the exact HTTPS
   production origin and no trailing slash.
2. Add repository secret `CRON_SECRET` with exactly the same value as the
   Vercel Production environment variable. Never store it as a plain variable.
3. Open Actions → Production hourly scheduler → Run workflow once. The run must
   complete sync, alerts and evaluation with 2xx responses. Provider endpoints
   also run when the current UTC hour is divisible by 8 or 12.
4. Confirm the scheduled workflow is enabled on the default branch and runs at
   minute 7 each hour. GitHub schedules may be delayed under load, so monitor
   the last successful run rather than expecting exact-to-the-minute execution.
5. Confirm Vercel Settings → Cron Jobs is empty; this is intentional for Hobby.
6. Confirm Admin shows a successful sync run, at least one fresh station in the
   service area, and `/api/ready` returns 200.
7. Confirm `APP_ENVIRONMENT=production`, Admin without a token returns 401, and
   `LOCAL_DEMO_MODE` is absent or false.

Do not call the production sync endpoint manually from browser history because
the bearer secret could be exposed. Use the protected GitHub Actions workflow
or a trusted terminal that obtains the secret from the password manager.

For the rollback drill, disable ML, redeploy, and use the stronger verifier:

```powershell
.venv\Scripts\python scripts\verify_deployment.py https://<STAGING_HOST> --expect-baseline-fallback
```

The result must show `baseline_fallback=true`; every returned forecast point
must omit model/artifact identity and report `ml_forecast_disabled`.
