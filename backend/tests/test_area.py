from backend.algorithms.area import is_nakhon_pathom


def test_nakhon_pathom_polygon_accepts_centre_and_rejects_neighbouring_area():
    assert is_nakhon_pathom(13.8199, 100.0622)
    assert not is_nakhon_pathom(13.7563, 100.5018)
    assert not is_nakhon_pathom(14.0208, 99.5348)
