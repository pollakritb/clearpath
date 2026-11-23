# VPS deployment

Production origin: `https://clearpath.plotpop.tech`. Supabase production project
remains `kmvxwfrmmictzuxbsncr`; presentation is a separate deployment/database.

## Services

Host: Hostinger Ubuntu 24.04, SSH account `deploy`. Project files live under
`/home/deploy/clearpath/releases/<release-tag>`; `current` points to the active
release. Do not deploy into Plotpop/Vireana directories or recreate their stacks.

`deploy/vps/compose.yml` runs Next.js standalone, FastAPI/Uvicorn and an internal
Caddy gateway. Only the gateway joins `vireana_vireana-net`. API/frontend have no
published ports. The gateway also binds `127.0.0.1:18080` for local smoke tests.
The existing Vireana edge Caddy owns ports 80/443 and HTTPS; append only the
ClearPath site block from `Caddyfile.edge`, validate, then reload gracefully.

## Environment and build

Keep secrets out of Git, build arguments, images and command output. Vercel
Sensitive variables cannot be exported: recover them from their source or
explicitly provision replacements. Never substitute the presentation database.
Backend secrets are in `/home/deploy/clearpath/shared/backend.env`, mode 600,
symlinked as `deploy/vps/.env.backend`. Compose uses raw env-file format.
The local operations copy is outside Git at
`~/Library/Application Support/ClearPath/VPS/production.env`; cutover backups and
the source/config manifest are in the same private directory.

The mode-600 `deploy/vps/.env` supplies `RELEASE_TAG`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EDGE_NETWORK`, and
`LOCAL_PORT=18080`. Only the public Supabase URL/anon key enter the frontend build.
`RELEASE_SHA` in the backend identifies the deployed source revision. Keep local
demo modes false and preserve all existing feature flags and delivery cutoffs.

From the release's `deploy/vps` directory:

```bash
docker compose config --quiet
docker compose build
docker compose up -d --wait
curl --fail http://127.0.0.1:18080/api/health
```

Run `scripts/verify_deployment.py` against the HTTPS origin after routing it.
Check `/api/ready` release and data freshness separately: an old source snapshot
does not mean the container failed. Check browser map, login redirects and camera
permissions on HTTPS. Do not invoke mutating cron endpoints as health checks.

## Cutover dependencies

- DNS A record `clearpath` points to the VPS; keep parent-domain/other apps' DNS.
- Supabase Auth Site URL becomes the new HTTPS origin; retain old allow-list URLs
  during transition and add the new origin plus `/settings/privacy`.
- Update only the `clearpath_production_url` Vault value after HTTPS/API checks.
  Existing primary Supabase cron names, schedules, tokens and SQL stay unchanged.
- GitHub repository variable `CLEARPATH_PRODUCTION_URL` points to the new origin.
  Provision `CRON_SECRET` to match the VPS backup credential.
- Replace the GitHub CAMS workflow with `clearpath-cams.timer` and disable that
  workflow before enabling the timer. Preserve its four UTC collection times.
  Install the service/timer under `/etc/systemd/system/`, with a mode-600
  `/home/deploy/clearpath/shared/scheduler.env` containing only `CRON_SECRET`.
  Check `systemctl list-timers clearpath-cams.timer` and the service journal.
  Grid collection runs even if station collection fails; transient grid requests
  retry twice, while authentication failures fail immediately.
- LINE's previous delivery cutoff must remain in force. Do not start the LINE
  delivery worker or copy presentation LINE credentials as part of migration.

## Rollback and maintenance

Keep the previous source release, image tags, env backup and edge Caddyfile backup.
To roll back a VPS release, run Compose from the previous release's directory with
its original environment, then repoint `current` and repeat HTTPS smoke checks.
Do not roll back the database. Returning to Vercel also requires restoring Auth,
Vault URL and GitHub scheduler configuration; confirm Vercel is available first.
The rotated GitHub backup credential must also match `CRON_SECRET` on whichever
host is activated; the independent Supabase primary token is unchanged.

Compose restarts services after reboot and rotates container logs (3 × 10 MB).
Back up shared config securely, monitor disk/RAM, and remove only unused ClearPath
images after a validated release. Never use global Docker prune on this shared VPS.
