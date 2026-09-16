from datetime import UTC, datetime

import pytest

from backend.core.errors import UpstreamError
from backend.services import roles


def test_role_change_uses_server_profile_and_writes_minimal_audit(monkeypatch):
    updates = []
    audits = []
    monkeypatch.setattr(
        roles.supabase_client,
        "get_existing_profile",
        lambda user_id: {"id": user_id, "role": "user"},
    )
    monkeypatch.setattr(
        roles.supabase_client,
        "update_profile_role",
        lambda user_id, role, updated_at: updates.append(
            (user_id, role, datetime.fromisoformat(updated_at).tzinfo)
        ),
    )
    monkeypatch.setattr(
        roles.supabase_client,
        "create_audit_log",
        lambda row: audits.append(row),
    )

    result = roles.change_user_role(
        target_user_id="target-user",
        new_role="moderator",
        actor_id="admin-user",
        reason="Needs to review uncertain reports",
    )

    assert result["previous_role"] == "user"
    assert result["role"] == "moderator"
    assert updates == [("target-user", "moderator", UTC)]
    assert audits == [
        {
            "actor_id": "admin-user",
            "action": "profile_role_changed",
            "entity_type": "profile",
            "entity_id": "target-user",
            "details": {
                "previous_role": "user",
                "role": "moderator",
                "reason": "Needs to review uncertain reports",
            },
        }
    ]


@pytest.mark.parametrize(
    ("target_user_id", "new_role", "error"),
    [
        ("admin-user", "moderator", "cannot_change_own_role"),
        ("target-user", "user", "role_unchanged"),
    ],
)
def test_role_change_rejects_self_change_and_noop(
    monkeypatch, target_user_id, new_role, error
):
    monkeypatch.setattr(
        roles.supabase_client,
        "get_existing_profile",
        lambda user_id: {"id": user_id, "role": "user"},
    )
    with pytest.raises(ValueError, match=error):
        roles.change_user_role(
            target_user_id=target_user_id,
            new_role=new_role,
            actor_id="admin-user",
            reason="Role governance test",
        )


def test_role_change_rolls_back_when_audit_fails(monkeypatch):
    updates = []
    monkeypatch.setattr(
        roles.supabase_client,
        "get_existing_profile",
        lambda user_id: {"id": user_id, "role": "user"},
    )
    monkeypatch.setattr(
        roles.supabase_client,
        "update_profile_role",
        lambda user_id, role, updated_at: updates.append((user_id, role)),
    )

    def fail_audit(_row):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(roles.supabase_client, "create_audit_log", fail_audit)

    with pytest.raises(UpstreamError) as exc:
        roles.change_user_role(
            target_user_id="target-user",
            new_role="moderator",
            actor_id="admin-user",
            reason="Needs to review uncertain reports",
        )

    assert str(exc.value) == "role_change_failed"
    assert updates == [("target-user", "moderator"), ("target-user", "user")]
