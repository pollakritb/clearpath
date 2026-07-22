"""Pure badge rules for the MVP community leaderboard."""


def derive_badges(
    *, reputation_score: int, approved_reports: int, helpful_reviews: int
) -> list[str]:
    badges: list[str] = []
    if approved_reports >= 1:
        badges.append("ผู้รายงานคนแรก")
    if approved_reports >= 5:
        badges.append("นักรายงานที่ยืนยันแล้ว")
    if approved_reports >= 20 and reputation_score >= 200:
        badges.append("ผู้พิทักษ์อากาศชุมชน")
    if helpful_reviews >= 5:
        badges.append("ผู้ช่วยตรวจข้อมูล")
    if reputation_score >= 500:
        badges.append("ความน่าเชื่อถือสูง")
    return badges
