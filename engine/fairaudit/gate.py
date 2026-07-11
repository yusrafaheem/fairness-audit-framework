"""
The pre-deployment quality gate.

This is what makes fairaudit usable in CI, not just as a standalone
reporting tool: given an :class:`~fairaudit.report.AuditReport`, decide
pass/fail against a severity threshold, and say exactly which metric(s)
caused the failure. The Node REST API's ``POST /api/gate`` endpoint and
the CLI's ``fairaudit gate`` command are both thin wrappers around this
function, so the pass/fail logic lives in exactly one place.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .report import AuditReport

# A severity score >= this value on ANY single metric blocks deployment by
# default. 70 corresponds to the "high" risk tier boundary defined in
# severity.py. Override per-metric via the `thresholds` argument for
# stricter or more lenient organizational policy.
DEFAULT_BLOCKING_SCORE = 70.0


@dataclass
class GateResult:
    passed: bool
    blocking_metrics: list[str] = field(default_factory=list)
    overall_severity_score: float = 0.0
    overall_severity_tier: str = "negligible"
    thresholds_used: dict[str, float] = field(default_factory=dict)
    domain: str | None = None

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "blocking_metrics": self.blocking_metrics,
            "overall_severity_score": self.overall_severity_score,
            "overall_severity_tier": self.overall_severity_tier,
            "thresholds_used": self.thresholds_used,
            "domain": self.domain,
        }


def evaluate_gate(report: AuditReport, thresholds: dict[str, float] | None = None) -> GateResult:
    """Evaluate a report against per-metric severity thresholds.

    ``thresholds`` maps metric_name -> max allowed severity score (0-100).
    Metrics not present in ``thresholds`` fall back to
    ``DEFAULT_BLOCKING_SCORE``. A metric "blocks" the gate if its severity
    score is *greater than or equal to* its threshold.
    """
    thresholds = thresholds or {}
    resolved_thresholds = {
        m.metric_name: thresholds.get(m.metric_name, DEFAULT_BLOCKING_SCORE) for m in report.metrics
    }

    blocking = [
        m.metric_name
        for m in report.metrics
        if m.severity_score >= resolved_thresholds[m.metric_name]
    ]

    return GateResult(
        passed=len(blocking) == 0,
        blocking_metrics=blocking,
        overall_severity_score=report.overall_severity_score,
        overall_severity_tier=report.overall_severity_tier,
        thresholds_used=resolved_thresholds,
        domain=report.domain,
    )
