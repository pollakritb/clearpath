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
    timing = parser.add_mutually_exclusive_group()
    timing.add_argument("--start", type=datetime.fromisoformat)
    timing.add_argument("--now", action="store_true")
    parser.add_argument("--release-reason")
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
        if not args.refs or not (args.start or args.now) or not args.operator:
            parser.error("--refs, --start or --now, and --operator are required")
        if args.start and args.start.tzinfo is None:
            parser.error("--start must include a timezone")
        refs = json.loads(args.refs.read_text())
        if args.now:
            if not args.release_reason or len(args.release_reason) < 10:
                parser.error("--now requires --release-reason (at least 10 characters)")
            refs.update(release_mode="immediate", immediate_reason=args.release_reason)
        result = (
            db.rpc(
                "set_contribution_v3_release",
                {
                    "p_enabled": not args.pause,
                    "p_starts_at": args.start.isoformat() if args.start else None,
                    "p_missions": args.missions,
                    "p_refs": refs,
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
