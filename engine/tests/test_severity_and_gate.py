"""Unit tests for severity scoring, the four-fifths rule check, and the
pre-deployment gate — none of these depend on scikit-learn/Fairlearn, so
they're also the fastest tests in the suite to iterate on."""

import pytest

from fairaudit.gate import DEFAULT_BLOCKING_SCORE, evaluate_gate
from fairaudit.report import AuditReport, MetricResult
from fairaudit.severity import (
    difference_to_severity,
    four_fifths_check,
    overall_severity,
    tier_for_score,
)


@pytest.mark.parametrize(
    "difference,expected_tier",
    [
        (0.0, "negligible"),
        (0.02, "negligible"),
        (0.07, "low"),
        (0.15, "moderate"),
        (0.25, "high"),
        (0.35, "critical"),
        (0.9, "critical"),
    ],
)
def test_difference_to_severity_tiers(difference, expected_tier):
    sev = difference_to_severity(difference)
    assert sev.tier == expected_tier
    assert 0 <= sev.score <= 100


def test_severity_monotonic_in_difference():
    scores = [difference_to_severity(d).score for d in [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.9]]
    assert scores == sorted(scores)


def test_four_fifths_check():
    assert four_fifths_check(0.9) is True
    assert four_fifths_check(0.8) is True
    assert four_fifths_check(0.79) is False
    assert four_fifths_check(None) is None


def test_overall_severity_takes_the_worst_metric():
    severities = {
        "demographic_parity": difference_to_severity(0.02),   # negligible
        "equalized_odds": difference_to_severity(0.35),        # critical
        "predictive_parity": difference_to_severity(0.15),     # moderate
    }
    overall = overall_severity(severities)
    assert overall.tier == "critical"
    assert overall.score == severities["equalized_odds"].score


def _make_report(scores: dict[str, float]) -> AuditReport:
    metrics = [
        MetricResult(
            metric_name=name,
            difference=0.0,
            ratio=None,
            by_group={},
            worst_group="group_b",
            best_group="group_a",
            severity_score=score,
            severity_tier=tier_for_score(score),
            passes_four_fifths_rule=None,
            remediation=[],
        )
        for name, score in scores.items()
    ]
    return AuditReport.new(
        domain="test",
        model_kind="test",
        n_test_samples=100,
        sensitive_feature_name="group",
        groups=["group_a", "group_b"],
        metrics=metrics,
        overall_severity_score=max(scores.values()),
        overall_severity_tier=tier_for_score(max(scores.values())),
        gate_pass=False,
        gate_thresholds={},
    )


def test_gate_passes_when_all_metrics_below_threshold():
    report = _make_report({"demographic_parity": 10, "equalized_odds": 20, "predictive_parity": 5})
    result = evaluate_gate(report)
    assert result.passed is True
    assert result.blocking_metrics == []


def test_gate_fails_when_one_metric_at_or_above_default_threshold():
    report = _make_report({"demographic_parity": 10, "equalized_odds": DEFAULT_BLOCKING_SCORE, "predictive_parity": 5})
    result = evaluate_gate(report)
    assert result.passed is False
    assert result.blocking_metrics == ["equalized_odds"]


def test_gate_respects_custom_thresholds():
    report = _make_report({"demographic_parity": 50, "equalized_odds": 10, "predictive_parity": 5})
    # Tighten demographic_parity's threshold below its score -> should now block.
    result = evaluate_gate(report, thresholds={"demographic_parity": 30})
    assert result.passed is False
    assert result.blocking_metrics == ["demographic_parity"]
