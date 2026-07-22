"""Delete expired private community evidence according to moderation retention."""

from __future__ import annotations

from . import supabase_client


def cleanup_expired_reports(limit: int = 200) -> dict:
    rows = supabase_client.list_expired_report_evidence(limit)
    deleted = 0
    failures = 0
    for row in rows:
        try:
            image_path = row.get("image_path")
            if image_path:
                supabase_client.delete_report_image(str(image_path))
            supabase_client.purge_report_evidence(str(row["report_id"]))
            deleted += 1
        except Exception:
            # Keep evidence metadata unpurged so the next scheduled run retries.
            failures += 1
    drafts = supabase_client.list_expired_report_drafts(limit)
    drafts_deleted = 0
    for draft in drafts:
        try:
            if not draft.get("submitted_at") and draft.get("image_path"):
                supabase_client.delete_report_image(str(draft["image_path"]))
            supabase_client.delete_expired_report_draft(str(draft["id"]))
            drafts_deleted += 1
        except Exception:
            failures += 1
    return {
        "eligible": len(rows),
        "evidence_purged": deleted,
        "drafts_deleted": drafts_deleted,
        "failures": failures,
    }
