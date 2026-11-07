"""Reproducible synthetic policy comparison, never a real-world validation claim."""

import json
from datetime import UTC, datetime, timedelta

from backend.algorithms.community_trust import project


def evaluate():
    now = datetime(2026, 11, 7, 12, tzinfo=UTC)

    def row(seq, day, voter, positive=True):
        return dict(
            seq=seq,
            action="set",
            voter_id=voter,
            reporter_id="synthetic-author",
            report_id=f"synthetic-{seq}",
            vote_day=day,
            eligible=True,
            reaction="like" if positive else "dislike",
            created_at=f"{day}T03:00:00Z",
            payload={},
        )

    days = [(now - timedelta(days=n)).date().isoformat() for n in (2, 1, 0)]
    small = [
        row(1 + i * 3 + j, day, f"account-{j}", j != 2)
        for i, day in enumerate(days)
        for j in range(3)
    ]
    popular = [row(1, days[0], "old-a", False), row(2, days[1], "old-b", False)] + [
        row(i + 3, days[2], f"new-{i}") for i in range(300)
    ]
    baseline = [
        row(i + 1, (now - timedelta(days=i + 1)).date().isoformat(), f"baseline-{i}")
        for i in range(3)
    ]
    wave = baseline + [row(i + 4, days[2], f"wave-{i}", False) for i in range(10)]
    wave.append(
        dict(
            seq=14,
            action="hold",
            payload={
                "target_sequences": list(range(4, 14)),
                "until": (now + timedelta(minutes=30)).isoformat(),
            },
        )
    )
    cases = {
        "new_user": project([], now=now),
        "small_community": project(small, now=now),
        "popular_day": project(popular, now=now),
        "held_wave": project(wave, now=now),
        "released_wave": project(wave, now=now + timedelta(minutes=31)),
    }
    return {
        "kind": "synthetic-only",
        "policy_version": "community-trust-v1",
        "reference_at": now.isoformat(),
        "cases": {
            name: {
                k: value[k]
                for k in (
                    "status",
                    "score",
                    "unique_voter_accounts",
                    "evaluated_report_count",
                    "evaluated_day_count",
                    "effective_day_weight",
                    "comparison",
                )
            }
            for name, value in cases.items()
        },
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(), indent=2))
