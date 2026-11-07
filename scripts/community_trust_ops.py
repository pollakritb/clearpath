"""Authorized server CLI: replay/reconcile, evidence findings and explicit policy release.

Never exposes a score-setting switch. Operator credentials come from server env only.
"""

import argparse
import json
from pathlib import Path

from backend.services.community import community_trust as trust


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("reconcile").add_argument("--after", type=int, default=None)
    scope = sub.add_parser("review-scope")
    scope.add_argument("--id", required=True)
    replay = sub.add_parser("inspect")
    replay.add_argument("--user", required=True)
    events = sub.add_parser("events")
    events.add_argument("--user", required=True)
    finding = sub.add_parser("finding")
    finding.add_argument("--user", required=True)
    finding.add_argument("--key", required=True)
    finding.add_argument("--file", type=Path, required=True)
    release = sub.add_parser("release")
    release.add_argument("--stage", choices=["off", "shadow", "public"], required=True)
    release.add_argument("--refs", type=Path, required=True)
    release.add_argument("--operator", required=True)
    args = parser.parse_args()
    if args.command == "reconcile":
        result = trust.reconcile(args.after)
    elif args.command == "review-scope":
        result = next(
            (
                r
                for r in trust.rpc("community_trust_review_queue", {"p_limit": 100})
                if r["id"] == args.id
            ),
            {"error": "pending_review_not_found"},
        )
    elif args.command in {"inspect", "events"}:
        snapshot = trust.rpc("community_trust_snapshot", {"p_user": args.user})
        cursor = snapshot.get("next_seq")
        while cursor is not None:
            page = trust.rpc(
                "community_trust_snapshot",
                {
                    "p_user": args.user,
                    "p_after": cursor,
                    "p_watermark": snapshot["ledger_seq"],
                },
            )
            snapshot["events"].extend(page["events"])
            cursor = page.get("next_seq")
        if args.command == "events":
            print(
                json.dumps(
                    snapshot["events"], ensure_ascii=False, default=str, indent=2
                )
            )
            return
        value = trust.project(snapshot["events"], now=trust.datetime.now(trust.UTC))
        result = {
            "recomputed": value,
            "projection_matches": all(
                (snapshot.get("projection") or {}).get(k) == value[k]
                for k in (
                    "score",
                    "evaluated_day_count",
                    "evaluated_report_count",
                    "unique_voter_accounts",
                )
            ),
        }
    elif args.command == "finding":
        result = {
            "sequence": trust.record_finding(
                args.user, args.key, json.loads(args.file.read_text())
            )
        }
    else:
        result = trust.rpc(
            "community_trust_release",
            {
                "p_stage": args.stage,
                "p_refs": json.loads(args.refs.read_text()),
                "p_operator": args.operator,
            },
        )
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))


if __name__ == "__main__":
    main()
