"""ระยะทาง great-circle ด้วยสูตร Haversine.

ใช้แทน Euclidean บน lat/lon ดิบ เพราะ 1° latitude ≠ 1° longitude
(ที่ไทย ~15°N: 1° lon ≈ 107 km, 1° lat ≈ 111 km) → ผลลัพธ์แม่นกว่า
"""
import math

EARTH_RADIUS_KM = 6371.0088  # mean Earth radius (IUGG)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """ระยะทางระหว่างสองพิกัด (กิโลเมตร)"""
    rad = math.pi / 180.0
    dlat = (lat2 - lat1) * rad
    dlon = (lon2 - lon1) * rad
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(dlon / 2.0) ** 2
    )
    return 2.0 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))
