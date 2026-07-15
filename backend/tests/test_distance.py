from backend.algorithms.distance import haversine_km


def test_zero_distance():
    assert haversine_km(13.75, 100.5, 13.75, 100.5) == 0.0


def test_bangkok_to_chiangmai():
    # ระยะตรง กทม.–เชียงใหม่ ~580 km (ยอมรับ ±15 km)
    d = haversine_km(13.7563, 100.5018, 18.7883, 98.9853)
    assert 565 < d < 595


def test_symmetry():
    a = haversine_km(13.0, 100.0, 18.0, 99.0)
    b = haversine_km(18.0, 99.0, 13.0, 100.0)
    assert abs(a - b) < 1e-9


def test_one_degree_latitude_about_111km():
    d = haversine_km(13.0, 100.0, 14.0, 100.0)
    assert 110 < d < 112
