"""Grid recovery must remain independent of station collection failures."""

from io import StringIO
from urllib.error import HTTPError, URLError

import pytest

from scripts import vps_cams_collect


def test_grid_recovers_after_station_failure_and_transient_upstream(
    monkeypatch, capsys
):
    calls = []
    monkeypatch.setenv("CRON_SECRET", "test-private-cron-token")
    monkeypatch.setattr(vps_cams_collect.time, "sleep", lambda _: None)

    def request(req, timeout):
        calls.append(req.full_url)
        if "cams-snapshots" in req.full_url:
            raise URLError("temporary station failure")
        if len(calls) == 2:
            raise HTTPError(req.full_url, 502, "upstream", {}, None)
        return StringIO('{"status":"ready"}')

    monkeypatch.setattr(vps_cams_collect, "urlopen", request)
    with pytest.raises(RuntimeError, match="grid completed"):
        vps_cams_collect.collect()
    assert sum("cams-grid" in url for url in calls) == 2
    assert "test-private-cron-token" not in capsys.readouterr().out


def test_invalid_cron_credentials_are_not_retried(monkeypatch):
    calls = []
    monkeypatch.setenv("CRON_SECRET", "test-private-cron-token")
    monkeypatch.setattr(vps_cams_collect.time, "sleep", lambda _: None)

    def request(req, timeout):
        calls.append(req.full_url)
        raise HTTPError(req.full_url, 401, "unauthorized", {}, None)

    monkeypatch.setattr(vps_cams_collect, "urlopen", request)
    with pytest.raises(HTTPError):
        vps_cams_collect.collect()
    assert len(calls) == 2  # One station request, one grid request, no retries.
