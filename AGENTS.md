<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ClearPath — project conventions

PM2.5-aware route planner. See `README.md` and `docs/superpowers/specs/` for full design.

## Layout (clean FE/BE split, single Vercel deploy)
- **FRONTEND** — `app/` (routing only, thin) + `frontend/` (UI: `components/ hooks/ lib/ types/`). FE knows only `/api/*`.
- **BACKEND** — `api/index.py` (Vercel entry) → `backend/` FastAPI app: `routers/` (HTTP boundary), `services/` (one file = one external source), `algorithms/` (pure, no I/O, unit-tested), `models/` (pydantic), `core/` (config, aqi, errors).
- TS contract `frontend/types/index.ts` MUST mirror `backend/models/schemas.py`.

## Conventions
- Routers stay thin; logic lives in `services/`/`algorithms/`. `algorithms/` has NO network/DB — keep it pure & tested.
- Services raise `ConfigurationError` (→503) / `UpstreamError` (→502) from `backend/core/errors.py`; never leak tracebacks.
- IDW uses **haversine** (not Euclidean). Resample routes to ~500m before scoring.
- Kriging (scipy/pykrige) is `requirements-dev` only — NOT deployed (function size). Prod = IDW; `method=kriging` falls back to IDW.
- Supabase is source of truth; air4thai is hit only by the hourly cron `/api/cron/sync`.

## Run / verify
- Dev: `uvicorn backend.main:app --reload --port 8000` + `npm run dev` (Next proxies `/api/*` → :8000).
- `npm run build` · `npm run lint` · `.venv/Scripts/python -m pytest`
