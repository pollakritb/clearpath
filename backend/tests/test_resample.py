from backend.algorithms.distance import haversine_km
from backend.algorithms.resample import resample_path


def test_short_path_unchanged():
    assert resample_path([[13.0, 100.0]]) == [(13.0, 100.0)]


def test_endpoints_preserved():
    path = [[13.0, 100.0], [13.0, 100.1]]
    out = resample_path(path, step_m=500)
    assert out[0] == (13.0, 100.0)
    assert out[-1] == (13.0, 100.1)


def test_spacing_about_step():
    # เส้นตรงแนวนอน ~11 km → จุดควรห่างกัน ~500m
    path = [[13.0, 100.0], [13.0, 100.1]]
    out = resample_path(path, step_m=500)
    gaps = [
        haversine_km(out[i][0], out[i][1], out[i + 1][0], out[i + 1][1])
        for i in range(len(out) - 1)
    ]
    # ทุกช่วง (ยกเว้นช่วงสุดท้ายที่เป็นเศษ) ควรใกล้ 0.5 km
    for g in gaps[:-1]:
        assert 0.45 < g < 0.55


def test_more_points_than_input_for_long_line():
    path = [[13.0, 100.0], [13.0, 100.1]]  # ~11 km
    out = resample_path(path, step_m=500)
    assert len(out) > 15  # ~22 ช่วง
