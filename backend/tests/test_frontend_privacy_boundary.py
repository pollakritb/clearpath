import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_browser_bundle_has_no_third_party_analytics_sdk_or_beacon():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    dependencies = {
        **package.get("dependencies", {}),
        **package.get("devDependencies", {}),
    }
    forbidden_packages = {
        "@amplitude/analytics-browser",
        "@sentry/nextjs",
        "@segment/analytics-next",
        "mixpanel-browser",
        "posthog-js",
        "react-ga4",
    }
    assert forbidden_packages.isdisjoint(dependencies)

    browser_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for directory in (ROOT / "app", ROOT / "frontend")
        for path in directory.rglob("*")
        if path.suffix in {".ts", ".tsx", ".js", ".jsx"}
    )
    assert "sendBeacon(" not in browser_sources
    assert "googletagmanager.com" not in browser_sources
