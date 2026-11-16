# Retire unused upstream AQI

Air4Thai ingestion consumes PM2.5 concentration and source date/time only. Upstream
AQI is ignored, even if supplied by a legacy caller. API Station/HistoryPoint no
longer contain `aqi`. PM2.5 classification, colors and health labels remain computed
from concentration; their `aqi` module/CSS names do not represent stored AQI values.

Apply `20261116185601_remove_unused_aqi.sql` only after deploying the compatible
application. It drops only `public.stations.aqi` and `public.pm25_readings.aqi`,
rebuilds their existing review views with the same service-role-only permissions
and security-invoker setting, and notifies the API schema cache. Unexpected SQL
dependencies or a lock wait longer than two seconds abort the entire transaction.
There is no CASCADE, table copy, backfill or database-wide timezone change.

Inspect Thailand time in Supabase Table Editor under schema `review`, views
`stations` and `pm25_readings`, using columns ending in `_bangkok`. They are computed
with `AT TIME ZONE 'Asia/Bangkok'`, including new rows automatically. They are wall
clock display values, not API timestamps. The underlying timestamptz instants stay
unchanged; Air4Thai already supplies +07:00. Do not add seven hours to stored values.
Other tables' display time is outside this scoped AQI change.

Before applying, download the two columns and their primary keys plus view metadata
to a private backup folder on the Mac (never backup tables on Supabase). This is a
scoped column backup, not a full project backup. To roll back, re-add nullable
integer columns, restore values by primary key from that backup, then restore the
saved view definitions/ACLs. Keep the compatible application until rollback is
verified. Dropping columns does not immediately compact existing table files.

Verification: `node scripts/test-aqi-retirement.mjs` tests atomic failure with an
unexpected dependency, row/FK/instant preservation, Bangkok conversion, future
inserts, and read-only permissions. Backend regression tests reject AQI ingestion
and storage, and TypeScript mirrors the updated OpenAPI contracts.
