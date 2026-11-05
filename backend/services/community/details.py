"""Resolve archived report links without widening their visibility."""

from .. import supabase_client
from ..measurement import service, store
from .presenter import present_report


def published_report(
    report_id: str, viewer_id: str, role: str, request_id: str | None = None
) -> dict:
    row = supabase_client.get_community_report(report_id)
    if not row or row.get("status") != "approved":
        raise KeyError(report_id)
    report = present_report(row)
    if (
        str(row["user_id"]) == viewer_id
        or role in {"admin", "moderator"}
        or report["is_fresh"]
    ):
        return report
    if request_id:
        request = store.get(request_id)
        if request and str(request.get("result_report_id")) == str(row["id"]):
            # Reuse the existing owner/invitation/claim permission boundary.
            service.view(request, viewer_id)
            return report
    raise KeyError(report_id)
