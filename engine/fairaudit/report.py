"""
The report schema shared by the CLI, the REST API, and the React
dashboard. Keeping this as one dataclass hierarchy with a single
``to_dict`` method is what lets the Node API and the frontend consume
audit output as plain JSON without any Python-specific serialization
logic on their end.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class MetricResult:
    metric_name: str
    difference: float
    ratio: float | None
    by_group: dict[str, Any]
    worst_group: str
    best_group: str
    severity_score: float
    severity_tier: str
    passes_four_fifths_rule: bool | None
    remediation: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AuditReport:
    domain: str
    model_kind: str
    generated_at: str
    n_test_samples: int
    sensitive_feature_name: str
    groups: list[str]
    metrics: list[MetricResult]
    overall_severity_score: float
    overall_severity_tier: str
    gate_pass: bool
    gate_thresholds: dict[str, float]

    @classmethod
    def new(cls, **kwargs) -> "AuditReport":
        kwargs.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
        return cls(**kwargs)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d

    def to_json(self, indent: int | None = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)
