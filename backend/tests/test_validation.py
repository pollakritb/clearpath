from backend.algorithms.validation import loocv, loocv_idw


def test_loocv_uniform_field_zero_error():
    # ค่าเท่ากันหมด → IDW ทำนายค่าเดิมเป๊ะ → error 0
    st = [
        {"lat": 13.0 + 0.02 * i, "lon": 100.0 + 0.02 * i, "pm25": 50.0}
        for i in range(8)
    ]
    m = loocv_idw(st)
    assert m["n"] == 8
    assert m["mae"] == 0.0
    assert m["rmse"] == 0.0
    # ค่าจริงเท่ากันหมด → variance 0 → R² ไม่นิยาม (None)
    assert m["r2"] is None


def test_loocv_metrics_basic(stations):
    m = loocv_idw(stations)
    assert m["n"] >= 3
    assert m["rmse"] is not None and m["mae"] is not None
    # RMSE ≥ MAE เสมอ (อสมการมาตรฐาน)
    assert m["rmse"] >= m["mae"] >= 0


def test_loocv_too_few_stations():
    m = loocv_idw([{"lat": 13.0, "lon": 100.0, "pm25": 50.0}])
    assert m["n"] < 3
    assert m["rmse"] is None and m["r2"] is None


def test_loocv_skips_none_predictions():
    # predict_fn คืน None ทุก fold → ไม่มีข้อมูลพอ
    m = loocv(
        [{"lat": 13.0 + i, "lon": 100.0, "pm25": 30.0} for i in range(5)],
        lambda lat, lon, others: None,
    )
    assert m["n"] == 0
    assert m["rmse"] is None
