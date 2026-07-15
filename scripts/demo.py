"""Debug demo — เดินครบ pipeline การให้คะแนนเส้นทางด้วยข้อมูลจำลอง
(ไม่ต้องใช้ API key / Supabase) ใช้ดู/ดีบักว่า algorithm ทำงานถูกต้อง

รัน:  .venv/Scripts/python scripts/demo.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.algorithms.distance import haversine_km
from backend.algorithms.idw import score_route
from backend.algorithms.resample import resample_path
from backend.core.aqi import classify_pm25

try:
    from backend.algorithms.kriging import kriging_score_route

    HAS_KRIGING = True
except Exception:
    HAS_KRIGING = False

# ── สถานีจำลองรอบกรุงเทพฯ (lat, lon, pm25) ────────────────────────────
STATIONS = [
    {"lat": 13.7563, "lon": 100.5018, "pm25": 72},  # ต้นทาง (สยาม)
    {"lat": 13.7460, "lon": 100.5340, "pm25": 95},  # อโศก — ฝุ่นเยอะ
    {"lat": 13.7400, "lon": 100.5450, "pm25": 92},
    {"lat": 13.7350, "lon": 100.5300, "pm25": 85},
    {"lat": 13.7720, "lon": 100.5120, "pm25": 48},  # โซนเหนือ — ฝุ่นน้อย
    {"lat": 13.7770, "lon": 100.5350, "pm25": 55},
    {"lat": 13.7800, "lon": 100.5200, "pm25": 52},
    {"lat": 13.7650, "lon": 100.4700, "pm25": 40},  # ตะวันตก — ดี
]

# ปลายทางเดียวกัน แต่ 2 เส้นทางต่างกัน
ROUTE_A = [  # ตรงผ่านโซนอโศก (ฝุ่นเยอะ)
    [13.7563, 100.5018],
    [13.7480, 100.5200],
    [13.7440, 100.5360],
    [13.7400, 100.5500],
]
ROUTE_B = [  # อ้อมขึ้นเหนือ (ฝุ่นน้อย)
    [13.7563, 100.5018],
    [13.7720, 100.5120],
    [13.7770, 100.5350],
    [13.7560, 100.5480],
    [13.7400, 100.5500],
]


def line(char="─", n=60):
    print(char * n)


def show_route(name, raw, method="idw"):
    waypoints = resample_path(raw, step_m=500)
    raw_km = sum(
        haversine_km(*raw[i], *raw[i + 1]) for i in range(len(raw) - 1)
    )
    if method == "kriging" and HAS_KRIGING:
        score = kriging_score_route(waypoints, STATIONS)
    else:
        score = score_route(waypoints, STATIONS)
    cls = classify_pm25(score["avg_pm25"])
    print(f"\n▶ {name}  ({method.upper()})")
    print(f"  ระยะ ~{raw_km:.1f} กม. · จุดดิบ {len(raw)} → resample {len(waypoints)} จุด (ทุก 500m)")
    print(f"  PM2.5 เฉลี่ย {score['avg_pm25']}  · สูงสุด {score['max_pm25']}  · ระดับ {cls['level']} ({cls['color']})")
    head = ", ".join(f"{s['pm25']}" for s in score["samples"][:8])
    print(f"  ค่าตามทาง (8 จุดแรก): {head} ...")
    return {"name": name, **score, "level": cls["level"]}


def main():
    print()
    line("═")
    print("ClearPath — Debug: เปรียบเทียบ 2 เส้นทาง (ข้อมูลจำลอง)")
    line("═")
    print(f"สถานีจำลอง: {len(STATIONS)} แห่ง · Kriging พร้อมใช้: {'ใช่' if HAS_KRIGING else 'ไม่ (ไม่ได้ติดตั้ง pykrige)'}")

    for method in (["idw", "kriging"] if HAS_KRIGING else ["idw"]):
        line()
        print(f"วิธี: {method.upper()}")
        a = show_route("เส้นทาง A (ผ่านอโศก)", ROUTE_A, method)
        b = show_route("เส้นทาง B (อ้อมเหนือ)", ROUTE_B, method)

        best = a if a["avg_pm25"] <= b["avg_pm25"] else b
        worst = b if best is a else a
        diff = round(worst["avg_pm25"] - best["avg_pm25"], 2)
        print(f"\n  ✅ แนะนำ: {best['name']} — PM2.5 เฉลี่ยต่ำกว่า {diff} µg/m³")
        spoken = (
            f"เส้นทางที่แนะนำคือ {best['name']} "
            f"ค่าฝุ่น PM 2.5 เฉลี่ย {best['avg_pm25']} ไมโครกรัมต่อลูกบาศก์เมตร "
            f"ระดับ {best['level']}"
        )
        print(f"  🔊 ข้อความเสียง (Web Speech): \"{spoken}\"")

    print()
    line("═")
    print("✔ pipeline ทำงานครบ: resample → interpolation → scoring → แนะนำ → ข้อความเสียง")
    line("═")


if __name__ == "__main__":
    main()
