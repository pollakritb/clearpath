"""Regenerate bundled place-label polygons from a reviewed geoBoundaries input."""

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    output = (
        Path(__file__).resolve().parents[1] / "backend/data/thailand-provinces.json"
    )
    names = {
        row["code"]: row["name"]
        for row in json.loads(output.read_text(encoding="utf-8"))
    }
    rows = []
    for feature in json.loads(args.source.read_text(encoding="utf-8"))["features"]:
        code = feature["properties"]["shapeISO"].removeprefix("TH-")
        geometry = feature["geometry"]
        if geometry["type"] not in {"Polygon", "MultiPolygon"}:
            raise ValueError("Expected Polygon or MultiPolygon")
        polygons = geometry["coordinates"]
        if geometry["type"] == "Polygon":
            polygons = [polygons]
        polygons = [
            [[[round(x, 6), round(y, 6)] for x, y in ring] for ring in polygon]
            for polygon in polygons
        ]
        points = [point for polygon in polygons for ring in polygon for point in ring]
        rows.append(
            {
                "code": code,
                "name": names[code],
                "bbox": [
                    min(p[0] for p in points),
                    min(p[1] for p in points),
                    max(p[0] for p in points),
                    max(p[1] for p in points),
                ],
                "polygons": polygons,
            }
        )
    if len(rows) != 77 or {row["code"] for row in rows} != set(names):
        raise ValueError(
            "Review province names before changing the 77-province dataset"
        )
    output.write_text(
        json.dumps(
            sorted(rows, key=lambda row: row["code"]),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
