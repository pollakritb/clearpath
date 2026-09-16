"""Server-authoritative user-role changes with a mandatory audit record."""

from __future__ import annotations

from contextlib import suppress
from datetime import UTC, datetime

from ..core.errors import UpstreamError
from . import supabase_client


def change_user_role(
    *, target_user_id: str, new_role: str, actor_id: str, reason: str
) -> dict:
    """Change a profile role and fail closed if its audit record cannot be stored."""

    if target_user_id == actor_id:
        raise ValueError("cannot_change_own_role")

    profile = supabase_client.get_existing_profile(target_user_id)
    previous_role = str(profile.get("role") or "user")
    if previous_role == new_role:
        raise ValueError("role_unchanged")

    changed_at = datetime.now(UTC).isoformat()
    try:
        supabase_client.update_profile_role(target_user_id, new_role, changed_at)
        supabase_client.create_audit_log(
            {
                "actor_id": actor_id,
                "action": "profile_role_changed",
                "entity_type": "profile",
                "entity_id": target_user_id,
                "details": {
                    "previous_role": previous_role,
                    "role": new_role,
                    "reason": reason.strip(),
                },
            }
        )
    except KeyError:
        raise
    except Exception as exc:
        with suppress(Exception):
            supabase_client.update_profile_role(
                target_user_id, previous_role, datetime.now(UTC).isoformat()
            )
        raise UpstreamError("role_change_failed") from exc

    return {
        "user_id": target_user_id,
        "previous_role": previous_role,
        "role": new_role,
        "changed_at": changed_at,
    }
