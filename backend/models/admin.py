"""Private administrator request contracts; not part of the public API barrel."""

from typing import Literal

from pydantic import BaseModel, Field


class FalseSafeReviewRequest(BaseModel):
    disposition: Literal[
        "expected_edge_case",
        "source_data_issue",
        "model_issue",
        "safety_incident",
    ]
    note: str = Field(min_length=10, max_length=1000)
