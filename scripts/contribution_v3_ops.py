"""Authorized server operations only; no Admin HTTP mutation endpoints."""

import argparse
import json
from datetime import datetime
from pathlib import Path

from backend.core.config import settings
from backend.services import supabase_client


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["status", "release", "reconcile", "reverse"])
    parser.add_argument("--refs", type=Path)
    parser.add_argument("--start", type=datetime.fromisoformat)
    parser.add_argument("--operator")
    parser.add_argument("--pause", action="store_true")
    parser.add_argument("--missions", action="store_true")
    parser.add_argument("--event")
    parser.add_argument("--reason")
    args = parser.parse_args()
    if settings.local_demo_mode:
        parser.error("server_database_configuration_required")
    db = supabase_client.get_client()
    if args.action == "status":
        result = db.rpc("contribution_v3_release", {}).execute().data
    elif args.action == "release":
        if not args.refs or not args.start or not args.operator:
            parser.error("--refs --start --operator are required")
        if args.start.tzinfo is None:
            parser.error("--start must include a timezone")
        result = (
            db.rpc(
                "set_contribution_v3_release",
                {
                    "p_enabled": not args.pause,
                    "p_starts_at": args.start.isoformat(),
                    "p_missions": args.missions,
                    "p_refs": json.loads(args.refs.read_text()),
                    "p_operator": args.operator,
                },
            )
            .execute()
            .data
        )
    elif args.action == "reverse":
        if not args.event or not args.reason or not args.operator:
            parser.error(
                "--event --reason --operator are required; no score field exists"
            )
        result = (
            db.rpc(
                "reverse_community_xp",
                {"p_event": args.event, "p_reason": f"{args.operator}: {args.reason}"},
            )
            .execute()
            .data
        )
        db.rpc("reconcile_contribution_v3", {}).execute()
        db.rpc("freeze_community_seasons", {}).execute()
    else:
        result = {
            "processed": db.rpc("process_community_xp", {"p_limit": 100})
            .execute()
            .data,
            "dependent_bonuses": db.rpc("reconcile_contribution_v3", {}).execute().data,
            "season_revisions": db.rpc("freeze_community_seasons", {}).execute().data,
        }
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
