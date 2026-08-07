"""Explicit, auditable model promotion/rollback RPC client (dry-run by default)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
from uuid import UUID

from backend.services.supabase_client import get_client

TRANSITION_DECISIONS = {
    "shadow": "approve_shadow",
    "canary": "approve_canary",
    "reject": "reject",
}


def load_evidence(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("release_evidence_must_be_json_object")
    return value


def rpc_request(
    action: str,
    registry_id: UUID,
    actor_id: UUID,
    reason: str,
    evidence: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    if action in TRANSITION_DECISIONS:
        return (
            "transition_forecast_model",
            {
                "p_registry_id": str(registry_id),
                "p_approved_by": str(actor_id),
                "p_decision": TRANSITION_DECISIONS[action],
                "p_reason": reason,
                "p_evidence": evidence,
            },
        )
    rpc = "promote_forecast_model" if action == "promote" else "rollback_forecast_model"
    parameter = "p_registry_id" if action == "promote" else "p_target_registry_id"
    return (
        rpc,
        {
            parameter: str(registry_id),
            "p_approved_by": str(actor_id),
            "p_reason": reason,
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action", choices=("shadow", "canary", "promote", "rollback", "reject")
    )
    parser.add_argument("registry_id", type=UUID)
    parser.add_argument("--actor-id", type=UUID, required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument(
        "--evidence-file",
        type=Path,
        help="JSON object with metric window, gate results and approval references.",
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--confirm-registry-id",
        help="Required with --apply; must exactly match registry_id.",
    )
    args = parser.parse_args()
    if len(args.reason.strip()) < 10:
        parser.error("--reason must contain at least 10 characters")
    try:
        evidence = load_evidence(args.evidence_file)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        parser.error(str(exc))
    summary = {
        "action": args.action,
        "registry_id": str(args.registry_id),
        "actor_id": str(args.actor_id),
        "reason": args.reason,
        "evidence": evidence,
        "apply": args.apply,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not args.apply:
        return 0
    if args.confirm_registry_id != str(args.registry_id):
        raise SystemExit("confirmation_registry_id_mismatch")
    rpc, parameters = rpc_request(
        args.action, args.registry_id, args.actor_id, args.reason, evidence
    )
    result = get_client().rpc(rpc, parameters).execute()
    print(json.dumps(result.data, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
