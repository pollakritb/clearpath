"""Server-only persistence for scheduled external feeds (no browser grants)."""

from .store_client import get_client


def claim(source: str, token: str) -> dict:
    return (
        get_client()
        .rpc("claim_external_feed", {"p_source": source, "p_token": token})
        .execute()
        .data
    )


def finish(source: str, token: str, payload: dict) -> dict:
    return (
        get_client()
        .rpc(
            "finish_external_feed",
            {"p_source": source, "p_token": token, "p_payload": payload},
        )
        .execute()
        .data
    )


def state(source: str) -> dict:
    rows = (
        get_client()
        .table("external_feed_sources")
        .select(
            "source,last_success_at,last_attempt_at,first_attempt_at,last_error,failures,checked_at,snapshot"
        )
        .eq("source", source)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else {}


def news(limit: int = 1000) -> list[dict]:
    return (
        get_client().rpc("list_external_news", {"p_limit": limit}).execute().data or []
    )
