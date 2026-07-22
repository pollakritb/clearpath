from backend.algorithms.gamification import derive_badges


def test_badges_follow_quality_milestones():
    assert (
        derive_badges(reputation_score=0, approved_reports=0, helpful_reviews=0) == []
    )
    badges = derive_badges(reputation_score=550, approved_reports=25, helpful_reviews=8)
    assert "ผู้พิทักษ์อากาศชุมชน" in badges
    assert "ผู้ช่วยตรวจข้อมูล" in badges
    assert "ความน่าเชื่อถือสูง" in badges
