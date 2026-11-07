"""Calendar seasons, stable revisions and privacy-safe presentations."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from threading import RLock

from ...algorithms.community_xp import rank_progress, stamp
from ...algorithms.contribution_v2 import month_window
from ...core.config import settings
from . import policy_v2, policy_v3

_FROZEN: dict[str, dict] = {}
_LOCK = RLock()


def _local_rows(month: str) -> list[dict]:
    from . import xp

    start, end = month_window(month, datetime.now(UTC))
    v3 = policy_v3.release()
    v3_month = bool(v3.get("starts_at") and end > stamp(v3["starts_at"]))
    reversed_ids = {e.get("reverses") for e in xp._EVENTS}
    result = []
    for uid, a in list(xp._ACCOUNTS.items()):
        points = sum(
            e["points"]
            for e in xp._EVENTS
            if e["user_id"] == uid
            and (v3_month or e.get("policy_version") == "contribution-v2")
            and e["points"] > 0
            and e["id"] not in reversed_ids
            and start <= stamp(e["occurred_at"]) < end
        )
        if points <= 0:
            continue
        t = xp.totals(uid)
        result.append(
            dict(
                user_id=uid,
                member_id=a["member_id"],
                alias=a["alias"],
                xp=points,
                lifetime_xp=t["lifetime_xp"],
                days=t["days"],
            )
        )
    result.sort(key=lambda r: (-r["xp"], r["member_id"]))
    prior = None
    rank = 0
    for index, row in enumerate(result, 1):
        if prior != row["xp"]:
            rank = index
        row["rank"] = rank
        prior = row["xp"]
    return result


def freeze_due() -> int:
    if not policy_v2.active() and not policy_v3.applies():
        return 0
    from . import xp

    if not settings.local_demo_mode:
        return xp.rpc("freeze_community_seasons", {}) or 0
    now = datetime.now(UTC)
    with _LOCK:
        months = {
            stamp(e["occurred_at"])
            .astimezone(month_window("month", now)[0].tzinfo)
            .strftime("%Y-%m")
            for e in xp._EVENTS
            if e.get("policy_version") == "contribution-v2"
            or (
                policy_v3.applies()
                and stamp(e["occurred_at"]) >= stamp(policy_v3.release()["starts_at"])
            )
        }
        for month in months:
            _, end = month_window(month, now)
            if now < end + timedelta(hours=72):
                continue
            rows = _local_rows(month)
            old = _FROZEN.get(month)

            def signature(data):
                return [(r["member_id"], r["xp"], r["rank"]) for r in data]

            if old and signature(old["rows"]) == signature(rows):
                continue
            _FROZEN[month] = dict(
                rows=deepcopy(rows),
                revision=old["revision"] + 1 if old else 1,
                frozen_at=now.isoformat(),
                previous_results=[
                    *old.get("previous_results", []),
                    {
                        key: deepcopy(old[key])
                        for key in ("rows", "revision", "frozen_at")
                    },
                ]
                if old
                else [],
            )
        return len(_FROZEN)


def board(period: str, offset: int, user_id: str | None) -> dict:
    from . import xp

    now = datetime.now(UTC)
    try:
        start, _ = month_window(period, now)
    except (ValueError, TypeError):
        raise ValueError("ช่วงอันดับต้องเป็นเดือนปฏิทิน") from None
    month = start.strftime("%Y-%m")
    policy = policy_v2.release()
    if policy_v3.applies():
        policy = policy | {"launched_at": policy_v3.release()["starts_at"]}
    metadata = dict(
        period=period,
        month=month,
        launched_at=policy.get("launched_at"),
        provisional=True,
        revision=0,
        frozen_at=None,
    )
    if not xp.enabled() or not policy.get("launched_at"):
        return metadata | dict(users=[], me=None, next_offset=None)
    if settings.local_demo_mode:
        freeze_due()
        frozen = _FROZEN.get(month)
        rows = deepcopy(frozen["rows"]) if frozen else _local_rows(month)
        rows = [
            r
            for r in rows
            if not xp._ACCOUNTS.get(r["user_id"], {}).get("hidden", True)
        ]
        previous_points, position = None, 0
        for index, item in enumerate(rows, 1):
            if item["xp"] != previous_points:
                position = index
            item["rank"] = position
            previous_points = item["xp"]
        me = next((r for r in rows if r["user_id"] == user_id), None)
        rows = rows[offset : offset + 51]
        if frozen:
            metadata.update(
                provisional=False,
                revision=frozen["revision"],
                frozen_at=frozen["frozen_at"],
            )
    else:
        response = xp.rpc(
            "community_v2_month_board",
            dict(p_month=month, p_offset=offset, p_user=user_id),
        )
        rows, me = response["rows"], response.get("me")
        metadata.update(
            {
                k: response[k]
                for k in ("provisional", "revision", "frozen_at")
                if k in response
            }
        )
    if user_id and not me:
        a, t = xp.account(user_id), xp.totals(user_id)
        if settings.local_demo_mode:
            own = next((r for r in _local_rows(month) if r["user_id"] == user_id), None)
            points = own["xp"] if own else 0
        else:
            points = (
                xp.rpc("community_v2_month_points", dict(p_month=month, p_user=user_id))
                or 0
            )
        me = dict(
            member_id=a["member_id"],
            alias=a["alias"],
            rank=None,
            xp=points,
            lifetime_xp=t.get("lifetime_xp", 0),
            days=t.get("days", 0),
        )
    identities = xp.leaderboard_names(
        [r["member_id"] for r in rows] + ([me["member_id"]] if me else [])
    )

    def present(row):
        return {k: row[k] for k in ("member_id", "rank", "xp", "lifetime_xp")} | dict(
            alias=identities.get(row["member_id"], row["alias"]),
            title=rank_progress(row["lifetime_xp"], row["days"]),
        )

    return metadata | dict(
        users=[present(r) for r in rows[:50]],
        me=present(me) if me else None,
        next_offset=offset + 50 if len(rows) > 50 else None,
    )
