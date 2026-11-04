# Registered measurement helper areas

This release separates private invitation locations from report measurement GPS.
A signed-in helper can save two locations (paused locations still count). Each
saved point receives requests whose existing 1/3/5 km circle contains it. Turning
notifications off retains the saved places; deleting a place removes its location.
Saved locations never restrict where a user may submit a report.

## Rollout (server operations, not an Admin dashboard action)

1. Apply `20261104120020_registered_measurement_locations.sql` after the existing
   numeric-identifier migrations. It creates the new storage but leaves its
   `measurement_request_control.registered_enabled` switch off. Existing GPS-based
   invitation behavior continues until activation.
2. Deploy frontend/backend together with
   `MEASUREMENT_REGISTERED_LOCATIONS_ENABLED=true`. Keep the SQL switch off until
   health, RLS and SQL contract checks pass. No public/environment client key is
   needed for this flag.
3. Activate with the server/database migration role:

   ```sql
   update public.measurement_request_control
   set registered_enabled=true where singleton;
   ```

   Activation clears the old helper GPS and turns old helper consent off. It does
   **not** convert last-known GPS to a saved address. Existing request and score
   history remains intact. Users explicitly register a point and opt in again.

4. Confirm the existing one-minute `/api/cron/measurement-requests` worker and
   `/api/cron/community-xp` scheduler remain enabled. The publication path also
   attempts matching immediately. Durable database jobs recover failed attempts.

For offline manual verification, start the demo backend with
`LOCAL_DEMO_MODE=true MEASUREMENT_REGISTERED_LOCATIONS_ENABLED=true`, then open
`/settings/notifications`. No hosted Supabase or LINE message is needed.

## Contracts and behavior

- `GET /api/measurement-requests/helper` includes
  `registered_locations_enabled`, `enabled`, and the owner's `locations`.
- `GET/POST /api/measurement-requests/helper/locations` lists/creates a point.
  `PATCH/DELETE .../locations/{slot}` changes/removes slot 1 or 2. Names, address,
  coordinates and per-location consent are editable. A profile row lock and a
  two-slot primary key enforce the limit across devices. Exact create retries
  reuse the existing identical point.
- `/presence` remains compatible but discards GPS updates in registered mode.
  The frontend no longer asks for automatic helper-presence GPS in this mode.
- `/api/measurement-requests/groups/{uuid}` is owner-scoped. Inbox and LINE links
  point to `/requests?group={uuid}`. Ordinary signed-in users still see all open
  requests without registering as a helper.
- Old GPS invitations retain their `matched_location_source=gps` label; new
  invitations say `registered`. Registered-place coordinates are never included
  in another user's request response or notification payload.

## Matching, points, and delivery

An approved publication adds a durable report job in the same database transaction.
The worker matches all still-open requests using stored exact report coordinates,
Haversine distance, captured/submitted timestamps within the request window and
approval no later than expiry. One report can close five requests, including the
reporter's own. A request closes once and all matches reference the same report.
Rejecting or delaying LINE does not affect these results.

Automatic help does not require clicking or claiming a request. The reporting
button is a shortcut. Submission GPS evidence is collected for ordinary reports
as well as contextual reports. The original photo/GPS/time evidence checks,
30-minute score cooldown, daily caps and requester-pair caps still apply. A
qualifying report earns at most **one** 5-point help bonus, using the oldest
eligible other-user request as its reference. Self-only fulfillment earns no
help bonus. Normal report points and rank thresholds are unchanged.

The existing XP worker waits for a pending report match job, so it cannot finalize
points before the match result is known. Request result counts are returned
separately as `matched_request_count` in the report's XP result. This count is not
multiplied into points.

Invitation batches are per recipient, accumulate for 60 seconds, and deduplicate
requests matching both saved locations. The inbox item updates as the group grows.
LINE sends on the next outbox worker tick after that window, normally 1–2 minutes.
Delivery rechecks active requests, current saved locations, opt-in, declined
requests and existing LINE/quiet-hour preferences. Fully closed or no-longer-
eligible groups are not delivered. Stable retry keys and delivery leases prevent
parallel/retried sends from creating duplicate messages.

## Verification and operational checks

- `.venv/bin/python -m pytest backend/tests/test_registered_measurements.py`
- `node scripts/test-registered-measurements.mjs` runs real PostgreSQL semantics
  locally through PGlite against the numeric/alias migration chain. It checks
  RLS, prohibited writes, the slot cap, grouped invitations, retry safety, five
  request fulfillment and a single automatic bonus. It never connects to a
  hosted database.
- Frontend tests cover two saved places, pause/delete actions, bypassing claims,
  and no background GPS in registered mode.

Monitor pending report jobs (age and count), `measurement_requests_processed`
failures, outbox failed/dead counts, and positive help events per report (must not
exceed one). Do not log address labels or coordinates. To suspend new invitations,
disable the API feature only after pending report jobs have drained; do not discard
pending XP or outbox history. Keep the migration in place during rollback, and do
not drop saved addresses or historical match records.
