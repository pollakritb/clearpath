from backend.services.gazetteer import search_locations


def test_local_gazetteer_finds_subdistrict_without_network():
    results = search_locations("ศาลายา")
    assert results
    assert results[0]["name"] == "ศาลายา"
    assert results[0]["district"] == "พุทธมณฑล"


def test_short_or_unknown_query_returns_empty():
    assert search_locations("ศ") == []
    assert search_locations("เชียงใหม่") == []
