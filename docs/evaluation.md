# Evaluating the PM2.5 Spatial Interpolation

> Methodology + results for validating ClearPath's core algorithm (IDW vs Ordinary Kriging).
> Auto-generated numbers live in [`eval/results.md`](eval/results.md); regenerate with
> `.venv/Scripts/python scripts/evaluate_interpolation.py`.

## 1. Why validate?

ClearPath estimates PM2.5 at every point along a route by interpolating from a sparse set of
ground sensors, then scores routes by the estimated exposure. The whole recommendation therefore
rests on **how accurate that interpolation is**. This chapter quantifies it instead of asserting it.

## 2. Dataset

- **175 stations** with a valid PM2.5 reading (air4thai network, stored in Supabase).
- A **frozen snapshot** of the exact readings is written to `docs/eval/station_snapshot_<ts>.csv`
  so every result is reproducible from the same data.
- The snapshot used for the figures below was taken during the rainy season, when PM2.5 is **low
  and fairly uniform across the country** (most stations 6–15 µg/m³). This matters for interpretation
  (Section 6).

## 3. Method — Leave-One-Out Cross-Validation (LOOCV)

For each station *i* with a known value:

1. **Remove** station *i* from the dataset.
2. **Predict** the value at *i*'s location using the remaining 174 stations.
3. Record the (observed, predicted) pair.

LOOCV is the standard validation for spatial interpolation: it never lets a method "see" the point
it is predicting, so it measures genuine out-of-sample accuracy. We run it for four predictors:

| Predictor | Description |
|---|---|
| **IDW** | Inverse Distance Weighting, haversine distance, `power=2`, `k=5` nearest |
| **Ordinary Kriging** | PyKrige, `exponential` variogram (chosen in Section 5) |
| **Nearest (Thiessen)** | Baseline: copy the single nearest station's value |
| **Global mean** | Baseline: ignore location, predict the mean of the others |

### Metrics

- **MAE** — mean absolute error (µg/m³).
- **RMSE** — root-mean-square error (µg/m³); penalises large errors more than MAE.
- **ME** — mean error (bias): + = over-predict, − = under-predict.
- **R²** — coefficient of determination: 1 = perfect, 0 = no better than predicting the mean,
  **< 0 = worse than the mean**.
- **Skill** — `1 − RMSE_method / RMSE_meanbaseline`: how much the method beats the naive global mean.

## 4. Results

See [`eval/results.md`](eval/results.md) for the live table and the predicted-vs-observed scatter
(`eval/figures/predicted_vs_observed.png`). On the snapshot above:

| Method | RMSE | MAE | R² | Skill vs mean |
|---|---|---|---|---|
| **Ordinary Kriging (exponential)** | **3.23** | **2.65** | **+0.094** | **+5.3 %** |
| Global mean (baseline) | 3.42 | 2.81 | −0.01 | 0 % |
| IDW (p=2, k=5) | 3.66 | 2.73 | −0.16 | −7.1 % |
| Nearest / Thiessen (baseline) | 4.26 | 3.14 | −0.57 | −24.7 % |

**Reading:** Ordinary Kriging is the only method that beats the global-mean baseline (positive skill
and R²). The naive nearest-neighbour baseline is by far the worst, confirming that simply copying the
closest sensor is inadequate. IDW with the textbook `power=2` slightly underperforms the mean on this
low-variance day (see Section 6).

## 5. Parameter selection (sensitivity analysis)

The defaults are **not** magic numbers — they were chosen by sweeping with the same LOOCV harness
(full grids in `eval/results.md`):

- **IDW `power × k`:** RMSE decreases with **lower power** and **more neighbours** (best ≈ `power=1`,
  `k=20`). A high power over-weights the single nearest noisy sensor; on a weakly-structured field a
  smoother average generalises better. `power=2, k=5` is kept as the conventional, widely-cited
  default but the sweep documents the trade-off.
- **Kriging variogram:** the original `linear` model gave R² ≈ −0.01; **`exponential` gives R² ≈ +0.09**
  (also `spherical` ≈ +0.09). The default was therefore **changed from `linear` to `exponential`** —
  a concrete example of evaluation driving a design decision.

## 6. Interpretation & limitations

- **Why is R² low / negative for some methods?** When the pollution field is nearly uniform (a clean
  rainy-season day), there is little spatial signal to exploit, so the global mean is already a strong
  predictor and only a well-specified model (exponential Kriging) edges past it. On days with real
  spatial gradients (haze/burning season) the spatial methods are expected to show clearly higher R².
  Reporting this honestly demonstrates that interpolation skill is **condition-dependent**, not a fixed
  property of the method.
- **Limitations:** (a) a single temporal snapshot — accuracy will vary by day/season;
  (b) stations are **spatially clustered** (dense in Bangkok, sparse elsewhere), so LOOCV is easier in
  cities than in rural areas; (c) urban siting bias in the sensor network; (d) PM2.5 has a daily cycle
  not modelled here.

## 7. Reproduce

```bash
.venv/Scripts/python scripts/evaluate_interpolation.py
```

Regenerates `docs/eval/station_snapshot_<ts>.csv`, `docs/eval/results.md`, and
`docs/eval/figures/predicted_vs_observed.png`. The live API surfaces the same comparison at
`GET /api/validate` (shown in-app under **"ความแม่นยำของแบบจำลอง"**).
