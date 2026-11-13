import math

import pytest

from backend.algorithms.province_labels import province_label
from backend.core.errors import ConfigurationError
from backend.services.province_labels import _provinces, resolve


@pytest.mark.parametrize(
    ("lat", "lon", "name"),
    [
        (15.3418, 99.99825, "จังหวัดอุทัยธานี"),
        (14.020123, 99.970456, "จังหวัดนครปฐม"),
        (13.7563, 100.5018, "กรุงเทพมหานคร"),
        (18.7883, 98.9853, "จังหวัดเชียงใหม่"),
        (7.88, 98.39, "จังหวัดภูเก็ต"),
        (16.44, 102.83, "จังหวัดขอนแก่น"),
    ],
)
def test_known_points_match_containing_provinces_across_thailand(lat, lon, name):
    assert resolve(lat, lon) == {"name": name, "address": "", "source": "local"}


def test_dataset_contains_77_unique_nonempty_provinces():
    rows = _provinces()
    assert len(rows) == len({row["code"] for row in rows}) == 77
    assert all(row["name"] and row["polygons"] for row in rows)


def test_missing_bundle_is_a_configuration_error(monkeypatch):
    from pathlib import Path

    _provinces.cache_clear()

    def missing(*args, **kwargs):
        raise FileNotFoundError("private filesystem details")

    monkeypatch.setattr(Path, "read_text", missing)
    with pytest.raises(ConfigurationError, match="ข้อมูลชื่อพื้นที่สำรอง"):
        resolve(15.3418, 99.99825)


def test_no_nearest_province_guess_for_sea_or_another_country():
    assert resolve(6, 99)["name"] == "จุดที่เลือก (6.00000, 99.00000)"
    assert resolve(16.8, 96.15)["name"] == "จุดที่เลือก (16.80000, 96.15000)"


def test_polygon_holes_multipolygons_and_invalid_coordinates():
    square = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]
    hole = [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]
    island = [[5, 0], [6, 0], [6, 1], [5, 1], [5, 0]]
    rows = [
        {
            "name": "พื้นที่ทดสอบ",
            "bbox": [0, 0, 6, 4],
            "polygons": [[square, hole], [island]],
        }
    ]
    assert province_label(rows, 0.5, 0.5)["name"] == "พื้นที่ทดสอบ"
    assert province_label(rows, 2, 2) is None
    assert province_label(rows, 0.5, 5.5)["name"] == "พื้นที่ทดสอบ"
    assert province_label(rows, math.nan, 1) is None
    assert province_label(rows, 1, math.inf) is None
