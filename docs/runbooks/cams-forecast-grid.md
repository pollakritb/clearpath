# Stored CAMS forecast map grid

The map layer is independent from the existing station forecast, observation
history, nearest-reading surface, reports and measurement requests. Keep
`FORECAST_SYSTEM_PAUSED=true`: the old forecast/model pipeline is not used.

## Data and rendering

- CAMS Global through Open-Meteo, `domains=cams_global`,
  `cell_selection=nearest`, `hourly=pm2_5`, `forecast_days=5`, UTC.
- Version `cams-global-0.4-th-v1`: 44 latitudes × 26 longitudes = 1,144 nodes,
  including one supporting grid interval around the Thailand bounding rectangle.
  Data coverage is 5–21°N, 97–106°E. The displayed raster is vector-clipped
  to the Natural Earth 10m Thailand multipolygon (including islands); point
  details use the same geometry. Supporting grid nodes remain available for
  interpolation along the border. See `frontend/lib/geo/README.md` for the
  pinned source and public-domain license. No road-scale resolution is implied.
- The national grid was checked against the API on 2026-10-29 UTC: all requested
  nodes matched returned coordinates within 0.001°, with 120 hourly timestamps.
  The local JSON artifact was 577,802 bytes. Four-byte numeric payload is about
  0.55 MB/generation; Postgres float8 values about 1.10 MB before overhead.
- Coordinates are canonical row/column indices; floating provider coordinates
  are validated with tolerance. Responses that change geometry, units or time
  axes fail the whole collection. Null values remain null.
- Source-native resolution is ~45 km / 3 hours, updated ~12 hourly. The returned
  API timestamps are hourly. ClearPath checks four six-hour UTC slots per day.
  It does not extend the actual source horizon to guarantee 120 future hours.
- Each generation is a coherent ClearPath retrieval, not a certified upstream
  model run: Open-Meteo does not supply a model-run ID here. `model_issued_at`
  remains null. Fetch start/end are separate. A repeat of the first batch before
  publication detects an upstream change during collection; discard/retry
  rather than blend it. The collection has a 20-minute lifetime.
- Canvas samples concentration by bilinear interpolation in latitude/longitude,
  then uses a continuous ramp derived from the central PM2.5 palette. Category
  thresholds are unchanged; cards use the same sampler and colour function.
  No IDW, station blending, extrapolation or filling missing corners. Opacity
  is 0.4. A 512 × 960 geographic Canvas raster is kept in one native Leaflet
  image overlay, so pan/zoom never clears or rebuilds it. Raster resolution
  does not increase model resolution. Missing areas remain transparent.
  Up to eight compressed raster URLs are cached; the next two frames are
  rendered during idle time.

Provider references: [API](https://open-meteo.com/en/docs/air-quality-api),
[terms and limits](https://open-meteo.com/en/terms).
Count coordinate processing, including the station collector and retries, in
quota estimates. A 25-location batch and ≥6-second workflow pacing keep the grid job
bounded; do not infer that one multi-location HTTP request costs one location.
The free hosted service is for non-commercial use.

## Persistence and API

Apply the additive `20261029193517_cams_forecast_grid.sql` only to the intended
local/staging database during development. Production installation and scheduler
activation use the separately authorized deployment sequence below.

Six tables store grid definitions, generations, frames, active pointer, jobs
and staging chunks. RLS is enabled; browser roles have no table or RPC grants.
Backend uses the server-only Supabase service role. RPCs are security invoker.

- `GET /api/forecast-grid/metadata`: no-store, current ready generation,
  coordinate axes, actual valid timestamps, retrieval times and attribution.
  An expired horizon returns `status=unavailable`. A set older than 18 hours
  remains usable only while its timestamps cover now; it is labelled stale.
- `GET /api/forecast-grid/frames`: required `generation_id`, timezone-aware
  `start` / `end`, `min_lat`, `max_lat`, `min_lon`, `max_lon`. Maximum six hourly
  frames (five-hour span). Bounds are limited to Thailand. Returns the cropped
  row/column origin and shape, frames in row-major order, plus supporting nodes.
  Missing values are null. A retired generation returns 410.
- Metadata axes are sent once. Frames are pinned to that generation and grid
  version; the browser rejects mismatches. The browser requests the bounded
  national grid in six-hour windows, not per viewport. It prepares all remaining
  forecast windows on opening CAMS with two concurrent requests, even before
  playback. Cache holds at most 40 windows keyed by generation and actual times.
  Closing CAMS stops queued prefetch work. Pan/zoom makes no new frame requests.
  An uncached time keeps the last surface and its actual timestamp visible
  with a loading notice until the requested frame is ready.

Public reads never invoke upstream. Fetch failures are sanitized as 502; a
missing/unconfigured database is not silently replaced with generated forecasts.

## Collection and deployment (separately authorized)

1. Apply migration, verify grants/RLS and the exact project ref.
2. Set `CAMS_GRID_COLLECTION_ENABLED=true` and the existing
   `CAMS_SNAPSHOT_EXPECTED_SUPABASE_REF` server-side for that environment.
3. Additive grid job uses the existing CAMS workflow at `00:23, 06:23, 12:23,
18:23 UTC` (07:23, 13:23, 19:23, 01:23 Bangkok). GitHub can run late.
   Set `CLEARPATH_CAMS_GRID_PRODUCTION_ENABLED=true` only when authorized.
   No Supabase cron is added; the station collector remains separate. The grid
   job waits for station collection (including failures/skips), then waits one
   minute before making upstream calls to avoid sharing its initial burst.
4. Protected `/api/cron/cams-grid` processes one checkpoint per call. Invoke
   until ready; workflow handles up to 80 calls with bounded HTTP retries.
5. Atomic job claim uses the six-hour slot, not hours since last completion.
   A 90-second lease blocks overlap. Chunks checkpoint independently, and five
   consecutive failures for a batch fail the job. A slot older than 20 minutes
   cannot continue. The previous active dataset remains available.
6. Publication validates all batches/frames and changes active pointer in one
   transaction. Identical payload hashes reuse the existing generation without
   pretending the retrieval is newer. Retain active + previous ready generation,
   with a one-hour reader grace period; retain job history for 30 days. Chunk
   cleanup is transactional after success. Later publication removes abandoned
   old generations; jobs/chunks expire after 30 days.
7. Verify metadata/frame generation IDs match, sample exact node values, monitor
   failed jobs, checkpoint progress, retrieval age and actual horizon end.
   Rollback by disabling the grid job/collection flag and closing the layer;
   no observation data needs restoring.

## Local QA without a Supabase/Docker stack

PGlite is a development-only PostgreSQL dependency, excluded from the Python
Vercel function. The preview launches only on loopback, has no remote database
credentials, and seeds the same migration with an actual API artifact. Other
features use the existing test/demo backend. It is not the production data path.

```sh
npm run test:grid:db
.venv/bin/python -m scripts.collect_cams_grid --output /tmp/clearpath-cams-grid.json
.venv/bin/python -m scripts.preview_cams_grid --data /tmp/clearpath-cams-grid.json --port 8001
```

In another terminal:

```sh
BACKEND_ORIGIN=http://127.0.0.1:8001 ENABLE_LOCAL_API_PROXY=true NEXT_PUBLIC_LOCAL_DEMO_MODE=true npm run build
npm run start -- --hostname 127.0.0.1 --port 3001
```

Open `http://127.0.0.1:3001/?layer=cams`. This build does not invalidate `.next-dev`
used by the regular dev server. Rebuild normally before a later production
release; do not deploy the preview environment flags. When a real local
Supabase stack is available, apply the migration there and use the normal
Supabase store to verify PostgREST integration and RLS on that stack too.

## Acceptance

- Current/history → CAMS → return restores mode, history time and observation
  layer choices without moving the viewport or resuming playback.
- One timeline, no station/report/nearest-reading/hotspot overlay in CAMS.
  GPS and authorized measurement requests remain usable. Request pins disappear
  at their deadline, including stale API rows and selected/deep-linked requests;
  cancellation/expiry history remains on the requests page. A local boundary
  timer hides expired pins even when polling fails.
- Taps/searches use grid values at the selected timestamp; request creation uses
  the selected coordinate and pauses playback. Opening panels, leaving the map
  or hiding the browser pauses playback; playback ends without looping.
- Rapid slider/move changes debounce and ignore old responses. Loading never
  relabels old colours as the new timestamp. Missing frames/cells stay honest.
- Verify mobile portrait/landscape, safe area, 44px targets, no dock/nav overlap,
  and a long playback session. Physical iPhone/Android checks remain a device QA
  step; browser viewport emulation is not a physical-device pass.
