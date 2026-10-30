# Community reports on the historical map

`GET /api/history/map` returns stations plus privacy-safe `reports` and `stacks`
for the same `target_at`. `count` remains the station count for compatibility.
The existing 24-hour timeline is unchanged. Report lifetime remains 180 minutes
from `captured_at`, independently of the official-station maximum-age setting.

A currently approved report appears only after its capture, submission and
publication times, and strictly before capture time plus 180 minutes. Pending,
rejected, future and malformed timestamps are excluded. Selection uses the
historical target, so a report expired today can still appear at its valid past
time. A gallery image submitted later never appears before submission/publication.
The database read filters the bounded capture interval and paginates all results
instead of reusing the current map's latest-200-report list.

The public presenter keeps location obfuscation, profile consent and private
metadata redaction. Report ages, station context and grouping use the historical
target. Stack anchors use already-obfuscated public report coordinates. Report
history does not alter current nearest-reading or IDW eligibility policies.

The UI labels historical report details and disables current engagement there.
It hides the current nearest-reading surface while viewing historical snapshots,
shows station/report counts, and clears obsolete selections when changing hours.
Report markers sit above station clusters so overlapping pins remain selectable.

Development checks cover capture/publication/expiry boundaries, a report already
expired at the present time, pagination beyond 1,000 rows, privacy, HTTP contracts
and stale-response handling. Use temporary local fixtures to verify disappearance
as the timeline crosses expiry; never insert QA reports into production.
