from backend.algorithms.district import resolve_station_district


def test_known_official_station_has_reviewed_district():
    assert resolve_station_district("81t", "นครปฐม") == "เมืองนครปฐม"


def test_area_parser_requires_explicit_district_marker():
    assert resolve_station_district("new", "ต.ศาลายา อ.พุทธมณฑล จ.นครปฐม") == "พุทธมณฑล"
    assert resolve_station_district("new", "จังหวัดนครปฐม") is None
