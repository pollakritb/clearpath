"""Bundled gazetteer; search never sends a user's query to a third party."""

from __future__ import annotations

import unicodedata

LOCATIONS = [
    ("เมืองนครปฐม", "เมืองนครปฐม", "district", 13.8199, 100.0622),
    ("พระปฐมเจดีย์", "เมืองนครปฐม", "subdistrict", 13.8196, 100.0597),
    ("สนามจันทร์", "เมืองนครปฐม", "subdistrict", 13.8149, 100.0407),
    ("นครปฐม", "เมืองนครปฐม", "subdistrict", 13.8242, 100.0722),
    ("ธรรมศาลา", "เมืองนครปฐม", "subdistrict", 13.8394, 100.1048),
    ("ดอนยายหอม", "เมืองนครปฐม", "subdistrict", 13.7343, 100.0614),
    ("กำแพงแสน", "กำแพงแสน", "district", 14.0041, 99.9898),
    ("ทุ่งกระพังโหม", "กำแพงแสน", "subdistrict", 14.0209, 99.9777),
    ("รางพิกุล", "กำแพงแสน", "subdistrict", 13.9828, 99.9375),
    ("นครชัยศรี", "นครชัยศรี", "district", 13.8017, 100.1815),
    ("บางแก้ว", "นครชัยศรี", "subdistrict", 13.8026, 100.1771),
    ("ท่าตำหนัก", "นครชัยศรี", "subdistrict", 13.7957, 100.1854),
    ("ดอนตูม", "ดอนตูม", "district", 13.9588, 100.0789),
    ("สามง่าม", "ดอนตูม", "subdistrict", 13.9245, 100.0908),
    ("บางเลน", "บางเลน", "district", 14.0215, 100.1717),
    ("บางหลวง", "บางเลน", "subdistrict", 14.1180, 100.1228),
    ("ลำพญา", "บางเลน", "subdistrict", 13.9979, 100.2202),
    ("สามพราน", "สามพราน", "district", 13.7263, 100.2154),
    ("อ้อมใหญ่", "สามพราน", "subdistrict", 13.7061, 100.2845),
    ("ไร่ขิง", "สามพราน", "subdistrict", 13.7420, 100.2597),
    ("กระทุ่มล้ม", "สามพราน", "subdistrict", 13.7448, 100.3155),
    ("พุทธมณฑล", "พุทธมณฑล", "district", 13.7954, 100.3214),
    ("ศาลายา", "พุทธมณฑล", "subdistrict", 13.7935, 100.3254),
    ("คลองโยง", "พุทธมณฑล", "subdistrict", 13.8825, 100.2927),
    ("มหาสวัสดิ์", "พุทธมณฑล", "subdistrict", 13.7771, 100.2916),
]


def _normalize(value: str) -> str:
    return "".join(unicodedata.normalize("NFKC", value).lower().split())


def search_locations(query: str, limit: int = 10) -> list[dict]:
    needle = _normalize(query)
    if len(needle) < 2:
        return []
    ranked: list[tuple[int, dict]] = []
    for index, (name, district, kind, lat, lon) in enumerate(LOCATIONS):
        haystack = _normalize(f"{name} {district} นครปฐม")
        position = haystack.find(needle)
        if position < 0:
            continue
        ranked.append(
            (
                position,
                {
                    "id": f"np-{index}",
                    "name": name,
                    "district": district,
                    "kind": kind,
                    "lat": lat,
                    "lon": lon,
                },
            )
        )
    ranked.sort(
        key=lambda item: (item[0], item[1]["kind"] != "subdistrict", item[1]["name"])
    )
    return [row for _score, row in ranked[:limit]]
