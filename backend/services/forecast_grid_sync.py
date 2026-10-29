"""One bounded checkpoint per call; publish a complete generation atomically."""

from datetime import UTC, datetime
from uuid import uuid4

from starlette.concurrency import run_in_threadpool

from ..algorithms.cams_grid import BATCH_COUNT, assemble, batch_points, definition
from ..core.config import settings
from ..core.errors import UpstreamError
from . import forecast_grid_store as store
from . import openmeteo_grid


async def sync() -> dict:
    if not settings.cams_grid_collection_enabled:
        return {"status": "disabled"}
    expected = settings.cams_snapshot_expected_supabase_ref.strip()
    if (
        not expected
        or settings.supabase_url.rstrip("/") != f"https://{expected}.supabase.co"
    ):
        return {"status": "disabled", "reason": "supabase_project_ref_mismatch"}
    now = datetime.now(UTC)
    slot = now.replace(
        hour=(now.hour // 6) * 6, minute=0, second=0, microsecond=0
    ).isoformat()
    token = str(uuid4())
    job = await run_in_threadpool(
        store.rpc,
        "claim_cams_grid",
        {
            "p_slot": slot,
            "p_token": token,
            "p_grid": definition(),
            "p_batches": BATCH_COUNT,
        },
    )
    if job["status"] != "claimed":
        return job
    job_id = job["id"]
    try:
        index = job["next_batch"]
        if index < BATCH_COUNT:
            chunk = await openmeteo_grid.fetch_batch(batch_points(index))
            await run_in_threadpool(
                store.rpc,
                "checkpoint_cams_grid",
                {
                    "p_job": job_id,
                    "p_token": token,
                    "p_batch": index,
                    "p_payload": chunk,
                },
            )
            # Finalization gets its own invocation; never combine two provider
            # fetches and a nationwide transaction inside a 60-second function.
            await run_in_threadpool(
                store.rpc,
                "release_cams_grid",
                {"p_job": job_id, "p_token": token, "p_error": False},
            )
            return {
                "status": "collecting",
                "completed_batches": index + 1,
                "batch_count": BATCH_COUNT,
            }
        chunks = await run_in_threadpool(store.chunks, job_id)
        anchor = await openmeteo_grid.fetch_batch(batch_points(0))
        if anchor != chunks[0]:
            raise ValueError("grid_upstream_changed_during_collection")
        frames, fingerprint = assemble(chunks)
        return await run_in_threadpool(
            store.rpc,
            "publish_cams_grid",
            {
                "p_job": job_id,
                "p_token": token,
                "p_frames": frames,
                "p_fingerprint": fingerprint,
            },
        )
    except Exception as exc:
        await run_in_threadpool(
            store.rpc,
            "release_cams_grid",
            {"p_job": job_id, "p_token": token, "p_error": True},
        )
        if isinstance(exc, (ValueError, KeyError, TypeError)):
            raise UpstreamError("ชุดกริด CAMS ไม่ผ่านการตรวจสอบ กรุณาลองรอบถัดไป") from exc
        raise
