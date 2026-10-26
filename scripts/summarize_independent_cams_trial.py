"""Summarize requested and CAMS grid coordinates across local trial runs.

This is a local, read-only analysis of gitignored evidence. The generated
Markdown file is derived data and can be rebuilt after every scheduled run.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

DEFAULT_DIRECTORY = Path(".forecast-validation/independent-four-station")
REPORT_NAME = "coordinates-all-rounds.md"
THAI_TIME = timezone(timedelta(hours=7))


def _coordinate(value: object) -> str:
    return f"{value:.6f}" if isinstance(value, (int, float)) else "ไม่มีข้อมูล"


def _distance(value: object) -> str:
    return f"{value:.3f}" if isinstance(value, (int, float)) else "ไม่มีข้อมูล"


def _load(directory: Path) -> list[tuple[Path, dict]]:
    runs = []
    for path in sorted(directory.glob("trial-*.json")):
        evidence = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(evidence, dict) or not isinstance(
            evidence.get("stations"), list
        ):
            raise ValueError(f"Invalid trial evidence: {path}")
        runs.append((path, evidence))
    if not runs:
        raise ValueError(f"No trial evidence in {directory}")
    return runs


def render(runs: list[tuple[Path, dict]], generated_at: datetime) -> str:
    by_slot = {
        datetime.fromisoformat(evidence["collection_slot_utc"]).astimezone(UTC): (
            path,
            evidence,
        )
        for path, evidence in runs
    }
    if len(by_slot) != len(runs):
        raise ValueError("Duplicate collection slot")

    slots = sorted(by_slot)
    missing = []
    expected = slots[0]
    while expected <= slots[-1]:
        if expected not in by_slot:
            missing.append(expected)
        expected += timedelta(hours=6)

    station_ids = sorted(
        {
            station["station_id"]
            for _, evidence in runs
            for station in evidence["stations"]
        }
    )
    lines = [
        "# พิกัดสถานีและ grid CAMS — รวมทุกรอบที่เก็บได้",
        "",
        f"> สร้างจากไฟล์ทดลองในเครื่อง ณ {generated_at.astimezone(THAI_TIME):%Y-%m-%d %H:%M} น. เวลาไทย",
        "> ไฟล์นี้เป็นผลรวม ณ เวลาที่สร้าง ไม่ใช่ข้อมูลสด; เรียกสคริปต์สรุปอีกครั้งเพื่ออัปเดต",
        "",
        f"- รอบที่มีหลักฐาน: **{len(runs)}** รอบ; สถานี: **{len(station_ids)}** แห่ง; แถวสถานี-รอบ: **{sum(len(e['stations']) for _, e in runs)}**",
        f"- ช่วงรอบ: **{slots[0].astimezone(THAI_TIME):%Y-%m-%d %H:%M}** ถึง **{slots[-1].astimezone(THAI_TIME):%Y-%m-%d %H:%M}** เวลาไทย",
        f"- รอบที่ขาดภายในช่วงนี้: **{len(missing)}** (ห้ามเติมย้อนหลังเป็น forecast ณ เวลานั้น)",
        "- พิกัด grid คือศูนย์กลางช่องแบบจำลอง ไม่ใช่สถานีตรวจวัด; ระยะห่างไม่ใช่คะแนนความแม่นยำ PM2.5",
        "- ข้อมูลต้นทางแยกจาก Production; ไฟล์นี้ไม่มี secret หรือข้อมูลผู้ใช้",
        "",
        "## รอบที่ขาด",
        "",
    ]
    if missing:
        lines.extend(
            f"- {slot.astimezone(THAI_TIME):%Y-%m-%d %H:%M} น. ไทย" for slot in missing
        )
    else:
        lines.append("ไม่มีในช่วงที่ตรวจ")

    lines.extend(
        [
            "",
            "## รายละเอียดทุกรอบ",
            "",
            "| รอบ (เวลาไทย) | สถานี | พิกัดที่ส่ง (lat, lon) | พิกัด grid ที่ตอบ (lat, lon) | ระยะถึง grid (กม.) | สถานะ | ไฟล์หลักฐาน |",
            "| --- | --- | --- | --- | ---: | --- | --- |",
        ]
    )
    for slot in slots:
        path, evidence = by_slot[slot]
        seen = set()
        for station in sorted(evidence["stations"], key=lambda row: row["station_id"]):
            station_id = station["station_id"]
            if station_id in seen:
                raise ValueError(f"Duplicate station {station_id} in {path}")
            seen.add(station_id)
            requested = (
                f"{_coordinate(station.get('requested_lat'))}, "
                f"{_coordinate(station.get('requested_lon'))}"
            )
            grid = (
                f"{_coordinate(station.get('grid_lat'))}, "
                f"{_coordinate(station.get('grid_lon'))}"
            )
            lines.append(
                f"| {slot.astimezone(THAI_TIME):%Y-%m-%d %H:%M} | `{station_id}` | "
                f"{requested} | {grid} | {_distance(station.get('grid_distance_km'))} | "
                f"{station.get('status', 'ไม่ทราบ')} | [{path.name}]({path.name}) |"
            )
    lines.extend(
        [
            "",
            "## อัปเดตไฟล์นี้",
            "",
            "รัน `.venv/Scripts/python -m scripts.summarize_independent_cams_trial` จาก root ของโปรเจกต์ หรือรอ Scheduled Task รอบถัดไป",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    args = parser.parse_args()
    report = render(_load(args.directory), datetime.now(UTC))
    destination = args.directory / REPORT_NAME
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", newline="\n", dir=args.directory, delete=False
    ) as handle:
        handle.write(report)
        temporary = Path(handle.name)
    os.replace(temporary, destination)
    print(destination)


if __name__ == "__main__":
    main()
