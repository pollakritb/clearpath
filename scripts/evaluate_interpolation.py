"""ประเมินความแม่นยำของ spatial interpolation (IDW vs Kriging vs baselines)

รัน:  .venv/Scripts/python scripts/evaluate_interpolation.py

ผลผลิต (ในโฟลเดอร์ docs/eval/):
- station_snapshot_<ts>.csv  — ภาพนิ่งของข้อมูลที่ใช้ (reproducible)
- results.md                 — ตารางผล LOOCV + sensitivity sweep
- figures/predicted_vs_observed.png — scatter ค่าทำนาย vs ค่าจริง

ใช้ Leave-One-Out Cross-Validation บนสถานีจริง: ถอดทีละสถานี ทำนายจากที่เหลือ เทียบค่าจริง
"""
from __future__ import annotations

import asyncio
import csv
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from backend.algorithms.idw import idw_value  # noqa: E402
from backend.algorithms.kriging import kriging_value  # noqa: E402
from backend.algorithms.validation import (  # noqa: E402
    loocv,
    loocv_idw,
    loocv_mean,
    loocv_nearest,
    loocv_pairs,
    skill_score,
)
from backend.services.stations import get_current_stations  # noqa: E402

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "eval"
)
FIG_DIR = os.path.join(OUT_DIR, "figures")


def kriging_fn(vm: str):
    return lambda lat, lon, others: kriging_value(lat, lon, others, vm)


def _row(name: str, m: dict, base_rmse: float | None) -> str:
    sk = skill_score(m.get("rmse"), base_rmse)
    sk_s = "—" if sk is None else f"{sk * 100:+.1f}%"
    f = lambda v: "—" if v is None else f"{v:.3f}"  # noqa: E731
    return f"| {name} | {m['n']} | {f(m['rmse'])} | {f(m['mae'])} | {f(m['me'])} | {f(m['r2'])} | {sk_s} |"


def main() -> None:
    os.makedirs(FIG_DIR, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    print("ดึงข้อมูลสถานี…")
    rows, source = asyncio.run(get_current_stations())
    stations = [
        {"id": r.get("id"), "lat": r["lat"], "lon": r["lon"], "pm25": r.get("pm25")}
        for r in rows
        if r.get("pm25") is not None
    ]
    n = len(stations)
    print(f"  ใช้ {n} สถานี (จาก {source})")

    # ── snapshot ───────────────────────────────────────────
    snap = os.path.join(OUT_DIR, f"station_snapshot_{ts}.csv")
    with open(snap, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "lat", "lon", "pm25"])
        for s in stations:
            w.writerow([s["id"], s["lat"], s["lon"], s["pm25"]])
    print(f"  snapshot -> {os.path.relpath(snap)}")

    # ── main comparison ────────────────────────────────────
    mean_m = loocv_mean(stations)
    near_m = loocv_nearest(stations)
    idw_m = loocv_idw(stations)  # power=2, k=5
    krig_m = loocv(stations, kriging_fn("exponential"))  # default ใหม่ (จาก sweep ข้อ 3)
    base = mean_m["rmse"]

    main_table = [
        "| วิธี | n | RMSE | MAE | ME (bias) | R² | Skill |",
        "|---|---|---|---|---|---|---|",
        _row("IDW (p=2, k=5)", idw_m, base),
        _row("Ordinary Kriging (exponential)", krig_m, base),
        _row("Nearest (Thiessen) — baseline", near_m, base),
        _row("Global mean — baseline", mean_m, base),
    ]
    print("\n".join(main_table))

    # ── IDW sensitivity: power x k ─────────────────────────
    powers = [1, 2, 3]
    ks = [3, 5, 8, 12, 20]
    idw_sweep = [["power \\ k", *[str(k) for k in ks]]]
    for p in powers:
        cells = [f"**{p}**"]
        for k in ks:
            m = loocv_idw(stations, power=float(p), k=k)
            cells.append(f"{m['rmse']:.3f}" if m["rmse"] is not None else "—")
        idw_sweep.append(cells)

    # ── Kriging variogram sweep ────────────────────────────
    variograms = ["linear", "spherical", "exponential", "gaussian"]
    krig_sweep = ["| variogram | RMSE | MAE | R² |", "|---|---|---|---|"]
    for vm in variograms:
        m = loocv(stations, kriging_fn(vm))
        f = lambda v: "—" if v is None else f"{v:.3f}"  # noqa: E731
        krig_sweep.append(f"| {vm} | {f(m['rmse'])} | {f(m['mae'])} | {f(m['r2'])} |")

    # ── scatter: predicted vs observed (IDW & Kriging) ─────
    ai, pi = loocv_pairs(stations, lambda lat, lon, o: idw_value(lat, lon, o, 2.0, 5))
    ak, pk = loocv_pairs(stations, kriging_fn("exponential"))
    lim = max(max(ai + pi, default=1), max(ak + pk, default=1)) * 1.05
    fig, axes = plt.subplots(1, 2, figsize=(9, 4.2))
    for ax, (a, pr, title, mm) in zip(
        axes,
        [(ai, pi, "IDW (p=2, k=5)", idw_m), (ak, pk, "Ordinary Kriging", krig_m)],
    ):
        ax.scatter(a, pr, s=14, alpha=0.55, edgecolors="none", color="#0e7c79")
        ax.plot([0, lim], [0, lim], "--", color="#c2433a", lw=1, label="1:1")
        ax.set_xlim(0, lim)
        ax.set_ylim(0, lim)
        ax.set_xlabel("Observed PM2.5 (µg/m³)")
        ax.set_ylabel("Predicted PM2.5 (µg/m³)")
        ax.set_title(f"{title}\nRMSE={mm['rmse']}  MAE={mm['mae']}  R²={mm['r2']}", fontsize=10)
        ax.set_aspect("equal", "box")
        ax.legend(loc="upper left", fontsize=8)
        ax.grid(True, alpha=0.25)
    fig.suptitle(f"LOOCV: Predicted vs Observed PM2.5 (n={n})", fontsize=11)
    fig.tight_layout()
    fig_path = os.path.join(FIG_DIR, "predicted_vs_observed.png")
    fig.savefig(fig_path, dpi=130)
    plt.close(fig)
    print(f"  figure -> {os.path.relpath(fig_path)}")

    # ── write results.md ───────────────────────────────────
    lines: list[str] = []
    lines.append("# ClearPath — Interpolation Accuracy (LOOCV)")
    lines.append("")
    lines.append(f"- Generated: `{ts}` · stations used: **{n}** · data source: `{source}`")
    lines.append(f"- Snapshot: `{os.path.basename(snap)}` (rerun on this file for deterministic results)")
    lines.append("- Method: Leave-One-Out Cross-Validation — each station is held out and predicted from the rest.")
    lines.append("- Metrics: RMSE/MAE in µg/m³; ME = bias; R² (1=perfect, 0=equals mean, <0=worse than mean); Skill = 1 − RMSE/RMSE_meanbaseline.")
    lines.append("")
    lines.append("## 1. Method comparison")
    lines.append("")
    lines.extend(main_table)
    lines.append("")
    lines.append("![Predicted vs Observed](figures/predicted_vs_observed.png)")
    lines.append("")
    lines.append("## 2. IDW sensitivity — RMSE by power × k")
    lines.append("")
    lines.append("| " + " | ".join(idw_sweep[0]) + " |")
    lines.append("|" + "---|" * len(idw_sweep[0]))
    for r in idw_sweep[1:]:
        lines.append("| " + " | ".join(r) + " |")
    lines.append("")
    lines.append("## 3. Kriging — RMSE by variogram model")
    lines.append("")
    lines.extend(krig_sweep)
    lines.append("")
    res_path = os.path.join(OUT_DIR, "results.md")
    with open(res_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"  results -> {os.path.relpath(res_path)}")
    print("\nเสร็จ — ดูผลที่ docs/eval/results.md")


if __name__ == "__main__":
    main()
