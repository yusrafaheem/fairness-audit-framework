"""
Turns a raw fairness metric difference (0.0-1.0) into a 0-100 severity
score and a human-readable risk tier.

The mapping is deliberately piecewise-linear and documented rather than a
single scaling constant, because a 5-point gap and a 35-point gap are not
equally "twice as bad" — small gaps are common noise, gaps beyond ~30
points are almost always a real, actionable disparity. The anchor points
below are a reasonable default policy; override them per deployment if
your organization has stricter (or more lenient) internal thresholds.

As a secondary, commonly-cited reference point for demographic parity
specifically, we also flag the EEOC "four-fifths rule": a selection-rate
ratio below 0.8 is treated by U.S. hiring-discrimination law as evidence
of adverse impact. That check is surfaced separately in the report; it
does not replace the general severity scoring below.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# (difference, severity score) anchor points used for linear interpolation.
_ANCHOR_DIFFS = [0.0, 0.05, 0.10, 0.20, 0.30, 0.40]
_ANCHOR_SCORES = [0, 20, 40, 70, 90, 100]

RISK_TIERS = (
    (0, 20, "negligible"),
    (20, 40, "low"),
    (40, 70, "moderate"),
    (70, 90, "high"),
    (90, 101, "critical"),
)

FOUR_FIFTHS_THRESHOLD = 0.8


@dataclass
class Severity:
    score: float
    tier: str
    passes_four_fifths_rule: bool | None = None


def difference_to_severity(difference: float) -> Severity:
    diff = float(min(1.0, abs(difference)))
    score = float(np.interp(diff, _ANCHOR_DIFFS, _ANCHOR_SCORES))
    tier = tier_for_score(score)
    return Severity(score=round(score, 1), tier=tier)


def tier_for_score(score: float) -> str:
    for lo, hi, name in RISK_TIERS:
        if lo <= score < hi:
            return name
    return "critical"


def four_fifths_check(ratio: float | None) -> bool | None:
    """EEOC-style adverse impact check: selection-rate ratio should be
    >= 0.8. Only meaningful for demographic parity; returns None for
    metrics without a defined ratio."""
    if ratio is None:
        return None
    return ratio >= FOUR_FIFTHS_THRESHOLD


def overall_severity(metric_severities: dict[str, Severity]) -> Severity:
    """The headline severity for an audit is the *worst* of its
    individual metric severities — a single badly-failing criterion is
    enough to block a pre-deployment gate, even if the other two look
    fine. A composite (mean) score is also useful for trend-tracking
    across audits, so callers that want it can average
    ``metric_severities`` themselves."""
    worst = max(metric_severities.values(), key=lambda s: s.score)
    return Severity(score=worst.score, tier=worst.tier)
