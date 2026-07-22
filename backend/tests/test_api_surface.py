import json

from backend.main import create_app


def test_new_product_api_surface_and_no_navigation_api():
    openapi = create_app().openapi()
    paths = set(openapi["paths"])
    assert "/api/forecast" in paths
    assert "/api/community/reports" in paths
    assert "/api/community/capture-session" in paths
    assert "/api/community/review-queue" in paths
    assert "/api/community/reports/{report_id}/reviews" not in paths
    assert "post" not in openapi["paths"]["/api/community/reports"]
    assert "/api/community/reports/{report_id}/ratings" in paths
    assert "/api/community/report-drafts" in paths
    assert "/api/community/report-drafts/{draft_id}/submit" in paths
    assert "/api/community/map-points" in paths
    assert "/api/community/announcements" in paths
    assert "/api/community/activities" in paths
    assert "/api/community/leaderboard" in paths
    assert "/api/community/me" in paths
    assert "/api/notifications/subscriptions" in paths
    assert "/api/notifications/preferences" in paths
    assert "/api/notifications" in paths
    assert "/api/locations/search" in paths
    assert "/api/cron/alerts" in paths
    assert "/api/admin/reports/{report_id}/moderate" in paths
    assert "/api/admin/announcements/{announcement_id}" in paths
    assert "/api/admin/notification-outbox" in paths
    assert "/api/health" in paths
    assert "/api/route/compare" not in paths
    assert "/api/geocode" not in paths
    assert "/api/community/reports/pending" not in paths


def test_public_contract_has_no_legacy_user_entered_pm25_field():
    openapi = create_app().openapi()
    assert "manual_pm25" not in json.dumps(openapi)
