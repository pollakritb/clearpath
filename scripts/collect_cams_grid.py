"""Read upstream into a local QA artifact; never writes to Supabase.

Usage: python -m scripts.collect_cams_grid --output /tmp/clearpath-cams-grid.json
The artifact is useful for local renderer verification and SQL integration tests.
"""

import argparse
import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from backend.algorithms.cams_grid import BATCH_COUNT, assemble, batch_points, definition
from backend.services.openmeteo_grid import fetch_batch


async def collect(output: Path):
    chunks = []
    started = datetime.now(UTC).isoformat()
    for index in range(BATCH_COUNT):
        chunks.append(await fetch_batch(batch_points(index)))
        print(f"validated_batch={index + 1}/{BATCH_COUNT}", flush=True)
        await asyncio.sleep(3)
    anchor = await fetch_batch(batch_points(0))
    if anchor != chunks[0]:
        raise ValueError("upstream_changed_during_collection_retry")
    frames, fingerprint = assemble(chunks)
    payload = {
        "grid": definition(),
        "started_at": started,
        "retrieved_at": datetime.now(UTC).isoformat(),
        "frames": frames,
        "fingerprint": fingerprint,
    }
    output.write_text(json.dumps(payload, separators=(",", ":")))
    output.chmod(0o600)
    print(
        f"grid_cells={len(frames[0]['values'])} frames={len(frames)} bytes={output.stat().st_size}",
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    asyncio.run(collect(parser.parse_args().output))
