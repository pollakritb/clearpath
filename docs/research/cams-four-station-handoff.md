# CAMS four-station trial — machine handoff

This is an isolated field experiment, **not** the ClearPath Production forecast pipeline. The collector calls Open-Meteo/CAMS Global and Air4Thai directly. It does not read or write Supabase. Do not enable the experiment's scheduler on two machines at once.

## State at handoff (27 October 2026)

- Trial window: 18 October 2026 12:00 UTC through 25 October 2026 12:00 UTC (exclusive), one slot every six hours; 28 slots expected.
- Local evidence: 27 JSON files for four stations (`103t`, `73t`, `78t`, `102t`), or 108 station-round records. The 19 October 2026 18:00 UTC slot is missing following a collection failure. Do not backfill it as though a forecast was fetched at that time.
- The final stored slot is 25 October 2026 06:00 UTC. Collection is over; the script has a stop window. The Windows Scheduled Task may remain registered but should not collect new trial data.
- Source and documentation are tracked in Git. Raw trial JSON, logs, and the generated `coordinates-all-rounds.md` are intentionally under gitignored `.forecast-validation/independent-four-station/`, **not on GitHub**. Transfer these files separately through a private channel if the Mac needs to inspect the evidence.
- The dated presentation summary is an interim report from 20 October, not the final seven-day result. No validated MAE, bias, or accuracy percentage is available because the hour-window meaning of Air4Thai `type=hr` timestamps has not been confirmed.

## Continue on macOS

```sh
git clone https://github.com/pollakritb/clearpath.git
cd clearpath
git fetch origin handoff/cams-field-trial
git switch --track origin/handoff/cams-field-trial
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m ruff format --check backend api scripts
.venv/bin/python -m ruff check backend api scripts
.venv/bin/python -m pytest
```

Copy the local evidence archive from Windows into a private directory on the Mac, verify its SHA-256 hash, then extract the JSON and coordinate summary into `.forecast-validation/independent-four-station/` inside the Mac checkout. Do **not** commit the extracted files, `.env` files, API keys, or machine credentials. The coordinate summary can be regenerated with:

```sh
.venv/bin/python -m scripts.summarize_independent_cams_trial
```

Before scoring forecast error or publishing trial data, confirm the Air4Thai hourly timestamp's averaging window and the relevant data reuse terms. The related methods and interim findings are in [the field-test note](2026-10-18-cams-four-station-field-test.md) and [the interim presentation summary](cams-four-station-presentation-summary.md).
