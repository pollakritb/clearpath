import json
from uuid import UUID

import pytest

from scripts.promote_forecast_model import load_evidence, rpc_request

REGISTRY_ID = UUID("00000000-0000-0000-0000-000000000001")
ACTOR_ID = UUID("00000000-0000-0000-0000-000000000002")


def test_shadow_request_is_atomic_transition_with_evidence(tmp_path):
    path = tmp_path / "evidence.json"
    path.write_text(json.dumps({"window_days": 30, "false_safe_reviewed": True}))
    evidence = load_evidence(path)
    rpc, parameters = rpc_request(
        "shadow", REGISTRY_ID, ACTOR_ID, "อนุมัติ shadow หลังตรวจ gate", evidence
    )
    assert rpc == "transition_forecast_model"
    assert parameters["p_decision"] == "approve_shadow"
    assert parameters["p_evidence"] == evidence


def test_promote_uses_existing_strict_rpc_without_unvalidated_evidence():
    rpc, parameters = rpc_request(
        "promote", REGISTRY_ID, ACTOR_ID, "อนุมัติหลัง canary ผ่านเกณฑ์", {"ok": True}
    )
    assert rpc == "promote_forecast_model"
    assert "p_evidence" not in parameters


def test_release_evidence_must_be_json_object(tmp_path):
    path = tmp_path / "evidence.json"
    path.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="json_object"):
        load_evidence(path)
