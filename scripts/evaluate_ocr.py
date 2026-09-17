"""Validate and optionally run the private OCR evaluation dataset.

Images and the labelled manifest belong in ``data/private/ocr-evaluation`` and
are ignored by Git. The command prints aggregate metrics only.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.algorithms.ocr_evaluation import evaluate_ocr_cases  # noqa: E402
from backend.core.config import settings  # noqa: E402
from backend.services.ocr import read_pm25  # noqa: E402

DEFAULT_MANIFEST = Path("data/private/ocr-evaluation/manifest.jsonl")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _load_manifest(path: Path) -> list[dict]:
    root = path.resolve().parent
    rows: list[dict] = []
    seen: set[str] = set()
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), 1
    ):
        if not line.strip():
            continue
        row = json.loads(line)
        case_id = str(row.get("case_id") or "").strip()
        if not case_id or case_id in seen:
            raise ValueError(f"line {line_number}: case_id is missing or duplicated")
        seen.add(case_id)
        image_path = (root / str(row.get("image") or "")).resolve()
        if root not in image_path.parents:
            raise ValueError(
                f"line {line_number}: image must remain inside dataset directory"
            )
        expected = row.get("expected_pm25")
        if expected is not None and not 0 <= float(expected) <= 1000:
            raise ValueError(f"line {line_number}: expected_pm25 is outside 0..1000")
        if not isinstance(row.get("conditions"), list) or not row["conditions"]:
            raise ValueError(f"line {line_number}: conditions must be a non-empty list")
        row["_image_path"] = image_path
        rows.append(row)
    return rows


async def _run_live(rows: list[dict], model: str | None) -> None:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    original_model = settings.openai_ocr_model
    if model:
        settings.openai_ocr_model = model
    try:
        for index, row in enumerate(rows, 1):
            image_path: Path = row["_image_path"]
            if not image_path.is_file():
                raise FileNotFoundError(f"missing image for case {row['case_id']}")
            content_type = mimetypes.guess_type(image_path.name)[0] or ""
            if content_type not in ALLOWED_IMAGE_TYPES:
                raise ValueError(f"unsupported image type for case {row['case_id']}")
            result = await read_pm25(image_path.read_bytes(), content_type)
            row.update(
                {
                    "predicted_pm25": result.get("pm25"),
                    "predicted_confidence": result.get("confidence", 0),
                    "predicted_device_detected": result.get("device_detected", False),
                    "predicted_display_clear": result.get("display_clear", False),
                }
            )
            print(f"evaluated {index}/{len(rows)}", file=sys.stderr)
    finally:
        settings.openai_ocr_model = original_model


def _public_rows(rows: list[dict]) -> list[dict]:
    return [
        {key: value for key, value in row.items() if key != "_image_path"}
        for row in rows
    ]


async def _main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate ClearPath PM2.5 OCR")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--live", action="store_true", help="send private images to OCR"
    )
    parser.add_argument(
        "--model", help="temporary model override for this evaluation only"
    )
    parser.add_argument(
        "--confirm-private-image-processing",
        action="store_true",
        help="required with --live to acknowledge server-side vendor processing",
    )
    parser.add_argument("--output", type=Path, help="optional aggregate JSON output")
    args = parser.parse_args()
    rows = _load_manifest(args.manifest)
    if args.model and not args.live:
        parser.error("--model requires --live")
    if args.live and not args.confirm_private_image_processing:
        parser.error("--live requires --confirm-private-image-processing")
    if args.live:
        await _run_live(rows, args.model)
    result = evaluate_ocr_cases(_public_rows(rows))
    result["model"] = args.model or settings.openai_ocr_model
    result["live_run"] = args.live
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
