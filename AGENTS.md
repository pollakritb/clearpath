<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ClearPath — project conventions

PM2.5 forecast + trusted community monitoring platform. See `README.md` and
`docs/superpowers/specs/` for full design. ระบบนำทาง/เปรียบเทียบเส้นทางถูกถอดออกแล้ว.

## Layout (clean FE/BE split, single Vercel deploy)

- **FRONTEND** — `app/` (routing only, thin) + `frontend/` (UI: `components/ hooks/ lib/ types/`). FE knows only `/api/*`.
- **BACKEND** — `api/index.py` (Vercel entry) → `backend/` FastAPI app: `routers/` (HTTP boundary), `services/` (one file = one external source), `algorithms/` (pure, no I/O, unit-tested), `models/` (pydantic), `core/` (config, aqi, errors).
- TS contract `frontend/types/index.ts` MUST mirror `backend/models/schemas.py`.
- Community workflow lives in `backend/services/community/`: submission, public presentation/privacy, and review/moderation stay separate.
- UI-only types import directly from `frontend/types/ui.ts`; do not export them from the API contract barrel.

## Conventions

- Routers stay thin; logic lives in `services/`/`algorithms/`. `algorithms/` has NO network/DB — keep it pure & tested.
- Services raise `ConfigurationError` (→503) / `UpstreamError` (→502) from `backend/core/errors.py`; never leak tracebacks.
- IDW uses **haversine** (not Euclidean). ใช้สำหรับพื้นผิวค่าฝุ่นและ validation.
- Forecast/trust algorithms ต้องเป็น pure functions, อธิบายผลได้ และมี unit tests.
- Kriging (scipy/pykrige) is `requirements-dev` only — NOT deployed (function size). Prod interpolation = IDW.
- Supabase is source of truth; air4thai is hit only by the hourly cron `/api/cron/sync`.
- Community reports เริ่ม `pending` เสมอและยังไม่มีค่า PM2.5 สาธารณะ; Admin ต้องอ่านภาพและกรอกค่าก่อน `approved`.
- OCR เป็นข้อมูลช่วย Admin เท่านั้น ไม่ใช่ค่าหลักและอนุมัติรายงานเองไม่ได้.
- Air4Thai ที่อายุไม่เกิน 1 ชั่วโมงภายใน 5 กม. เป็นข้อมูลหลัก; community เป็น supplementary.
- Community เข้า IDW ได้เฉพาะ approved/fresh/Trust ≥60 และต้อง corroborated จากผู้ใช้คนละคน ≥2 ราย หรือ Trust ≥80 พร้อม calibrated device.
- Gap-fill ต้องมี GPS accuracy ≤200 ม., ไม่วัดติดแหล่งกำเนิดโดยตรง และไม่เป็นภาพซ้ำ.
- Peer review รับเฉพาะผู้ใช้ที่ส่ง GPS อยู่ภายใน 3 กม. รายงานอายุไม่เกิน 3 ชั่วโมง และต้องมี reason code ที่สอดคล้องกับผลโหวต.
- พิกัดจริงเปิดเฉพาะ Admin; public coordinates ต้องผ่าน stable obfuscation 120–250 ม.
- Fire alert ใช้ hotspot ในขอบเขตนครปฐมที่อายุไม่เกิน 12 ชั่วโมง และต้องเรียกว่า satellite hotspot ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว.
- ภาพรายงานเก็บ private bucket; ฝั่ง browser ห้ามถือ service-role/OpenAI/admin keys.

## Run / verify

- Dev: `uvicorn backend.main:app --reload --port 8000` + `npm run dev` (Next proxies `/api/*` → :8000).
- `npm run format:check` · `npm run lint` · `npm run typecheck` · `npm run build`
- `.venv/Scripts/python -m ruff format --check backend api scripts` · `.venv/Scripts/python -m ruff check backend api scripts` · `.venv/Scripts/python -m pytest`
