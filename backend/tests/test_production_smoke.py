"""Deployment failures and upstream data delays must remain distinguishable."""

from copy import deepcopy

import pytest

from scripts import production_smoke as smoke


def readiness():
    return {
        "service": "clearpath-api",
        "release": "expected",
        "status": "ready",
        "reason": None,
        "checks": {"source_of_truth": True, "station_data": True},
        "station_count": 178,
        "fresh_station_count": 145,
        "fresh_max_age_minutes": 60,
        "surface_max_age_minutes": 90,
    }


def test_stale_data_is_a_warning_and_not_a_deployment_failure():
    body = readiness()
    body.update(status="not_ready", reason="station_data_stale", fresh_station_count=0)
    body["checks"]["station_data"] = False
    result = smoke.assess((200, {"ok": True}), (503, body), "expected")
    assert result["deploy_ok"] is True
    assert result["data_status"] == "stale"


@pytest.mark.parametrize(
    "patch",
    [
        {"release": "old"},
        {"station_count": 0},
        {"fresh_station_count": -1},
        {"fresh_max_age_minutes": 90},
        {"surface_max_age_minutes": 180},
        {"checks": {"source_of_truth": False}},
        {"reason": "source_of_truth_unavailable"},
        {"status": "not_ready"},
        {"fresh_station_count": 999},
    ],
)
def test_invalid_release_or_database_contract_still_fails(patch):
    body = readiness() | deepcopy(patch)
    result = smoke.assess((200, {"ok": True}), (200, body), "expected")
    assert result["deploy_ok"] is False
    assert result["data_status"] == "unknown"


def test_unavailable_or_malformed_response_does_not_count_as_upstream_delay():
    assert not smoke.assess((500, {}), (503, readiness()), "expected")["deploy_ok"]
    assert not smoke.assess((200, {"ok": True}), (503, {}), "expected")["deploy_ok"]


def test_poll_retries_old_release_then_passes_and_only_reads_health_and_ready(
    monkeypatch,
):
    calls = []

    def read(url):
        calls.append(url)
        if url.endswith("/health"):
            return 200, {"ok": True}
        body = readiness()
        if len(calls) == 2:
            body["release"] = "old"
        return 200, body

    monkeypatch.setattr(smoke, "read_json", read)
    monkeypatch.setattr(smoke.time, "sleep", lambda _: None)
    result = smoke.poll("https://local.test", "expected", attempts=2)
    assert result["deploy_ok"] is True
    assert result["attempt"] == 2
    assert (
        calls == ["https://local.test/api/health", "https://local.test/api/ready"] * 2
    )


def test_attempts_are_bounded_when_release_never_arrives(monkeypatch):
    monkeypatch.setattr(smoke, "read_json", lambda _: (0, {}))
    monkeypatch.setattr(smoke.time, "sleep", lambda _: None)
    result = smoke.poll("https://local.test", "expected", attempts=3)
    assert not result["deploy_ok"]
    assert result["attempt"] == 3


def test_read_json_preserves_http_503_and_validates_json(monkeypatch):
    import io
    import json
    from urllib.error import HTTPError

    body = readiness()

    def stale_response(*args, **kwargs):
        raise HTTPError(
            "https://local.test/ready",
            503,
            "stale",
            {},
            io.BytesIO(json.dumps(body).encode()),
        )

    monkeypatch.setattr(smoke, "urlopen", stale_response)
    assert smoke.read_json("https://local.test/ready") == (503, body)


@pytest.mark.parametrize("checks", [None, [], "unavailable"])
def test_malformed_checks_fail_without_crashing(checks):
    body = readiness() | {"checks": checks}
    assert not smoke.assess((200, {"ok": True}), (200, body), "expected")["deploy_ok"]


def test_main_warns_for_stale_data_and_writes_separate_summary(
    monkeypatch, tmp_path, capsys
):
    path = tmp_path / "summary.md"
    monkeypatch.setenv("CLEARPATH_PRODUCTION_URL", "https://local.test")
    monkeypatch.setenv("EXPECTED_RELEASE", "expected")
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(path))
    monkeypatch.setattr(
        smoke,
        "poll",
        lambda *args: {
            "deploy_ok": True,
            "data_status": "stale",
            "fresh_station_count": 0,
            "station_count": 178,
        },
    )
    assert smoke.main() == 0
    assert "::warning::" in capsys.readouterr().out
    assert "Deployment: **verified**" in path.read_text()
    assert "Data freshness: **stale**" in path.read_text()
