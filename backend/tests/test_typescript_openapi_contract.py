from __future__ import annotations

import re
from pathlib import Path

import pytest

from backend.main import create_app

ROOT = Path(__file__).resolve().parents[2]


def _typescript_fields(path: str, interface_name: str) -> set[str]:
    source = (ROOT / path).read_text(encoding="utf-8")
    match = re.search(
        rf"^export interface {re.escape(interface_name)}[^{{]*\{{(.*?)^\}}",
        source,
        flags=re.MULTILINE | re.DOTALL,
    )
    assert match, f"TypeScript interface {interface_name} not found in {path}"
    return set(
        re.findall(
            r"^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??\s*:", match.group(1), re.MULTILINE
        )
    )


@pytest.mark.parametrize(
    ("schema", "path"),
    [
        ("Station", "frontend/types/air-quality.ts"),
        ("StationsResponse", "frontend/types/air-quality.ts"),
        ("ReadinessResponse", "frontend/types/meta.ts"),
        ("Weather", "frontend/types/environment.ts"),
        ("LocationLabelResponse", "frontend/types/locations.ts"),
        ("FirmsResponse", "frontend/types/environment.ts"),
        ("CommunityReport", "frontend/types/community.ts"),
        ("CommunityReportsResponse", "frontend/types/community.ts"),
        ("AlertLocationInput", "frontend/types/notifications.ts"),
        ("AlertLocationStatus", "frontend/types/notifications.ts"),
        ("NotificationPreferences", "frontend/types/notifications.ts"),
        ("ForecastGridMetadata", "frontend/types/forecast-grid.ts"),
        ("ForecastGridFrame", "frontend/types/forecast-grid.ts"),
        ("ForecastGridFrames", "frontend/types/forecast-grid.ts"),
        ("ForecastResponse", "frontend/types/forecast.ts"),
        ("ForecastSurfaceResponse", "frontend/types/forecast.ts"),
        ("ParticipationRank", "frontend/types/xp.ts"),
        ("XPSummary", "frontend/types/xp.ts"),
        ("MeasurementRequestView", "frontend/types/measurement.ts"),
    ],
)
def test_typescript_contract_fields_mirror_openapi(schema: str, path: str):
    openapi_fields = set(
        create_app().openapi()["components"]["schemas"][schema]["properties"]
    )
    typescript_fields = _typescript_fields(path, schema)
    assert typescript_fields == openapi_fields, {
        "schema": schema,
        "missing_in_typescript": sorted(openapi_fields - typescript_fields),
        "extra_in_typescript": sorted(typescript_fields - openapi_fields),
    }


def test_rank_dialog_mirrors_server_xp_policy():
    from backend.algorithms.community_xp import RANKS

    source = (ROOT / "frontend/components/community/RankDetails.tsx").read_text()
    levels = re.search(r"const LEVELS = \[(.*?)\] as const", source, re.DOTALL)
    assert levels
    frontend = re.findall(r'\["([^"\n]+)", "([^"\n]+)", (\d+)\]', levels[1])
    assert [(code, label, int(xp)) for code, label, xp in frontend] == list(RANKS)
