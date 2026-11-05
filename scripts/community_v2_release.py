"""Server release control. Read-only by default; keeps all previous points on rollback."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.services import supabase_client as db


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "operation", choices=["status", "baseline", "activate", "rollback"]
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--threshold", type=float)
    parser.add_argument("--evaluation-ref")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    client = db.get_client()
    if args.operation == "baseline":
        if not args.output:
            parser.error("--output is required for the private baseline artifact")
        data = client.rpc("community_xp_totals", {}).execute().data
        args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        args.output.chmod(0o600)
        print(json.dumps({"baseline_saved": True, "accounts": len(data)}))
    elif args.operation == "status" or not args.apply:
        policy = (
            client.table("community_policy_release")
            .select("*")
            .eq("singleton", True)
            .single()
            .execute()
            .data
        )
        print(
            json.dumps(
                {"policy": policy, "dry_run": args.operation != "status"},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        if args.operation == "activate" and (
            args.threshold is None or not args.evaluation_ref
        ):
            parser.error(
                "activation requires the independently evaluated threshold and artifact reference"
            )
        result = (
            client.rpc(
                "set_community_v2_release",
                dict(
                    p_active=args.operation == "activate",
                    p_threshold=args.threshold,
                    p_validation_ref=args.evaluation_ref,
                ),
            )
            .execute()
            .data
        )
        print(json.dumps({"policy": result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
