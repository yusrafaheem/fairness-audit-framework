"""
Rule-based remediation guidance.

Given a metric name, its severity tier, and which group is disadvantaged,
return concrete, actionable next steps. These are intentionally specific
enough to hand to an ML engineer, not generic "reduce bias" platitudes —
most point at a named Fairlearn API or a well-established mitigation
technique.
"""

from __future__ import annotations

_BASE_GUIDANCE = {
    "demographic_parity": [
        "Audit the training labels for {worst_group}: a selection-rate gap this size often "
        "means the *historical decisions* used as labels were biased, not just the features.",
        "Try Fairlearn's `Reweighing`-style sample weighting or `CorrelationRemover` to reduce "
        "the model's reliance on features correlated with the sensitive attribute.",
        "Consider Fairlearn's `ThresholdOptimizer` to set group-specific decision thresholds "
        "that equalize selection rates without retraining the underlying model.",
    ],
    "equalized_odds": [
        "Check whether {worst_group} is under-represented in the training set relative to its "
        "share of the deployment population — equalized-odds gaps frequently trace back to "
        "class imbalance within a group, not model architecture.",
        "Apply Fairlearn's `ExponentiatedGradient` reduction with an `EqualizedOdds` constraint "
        "to retrain with the fairness objective built in, rather than patched on afterward.",
        "Review feature engineering for proxies (features that correlate strongly with the "
        "sensitive attribute) that may be letting the model reconstruct group membership "
        "indirectly.",
    ],
    "predictive_parity": [
        "Recalibrate model scores per group (Platt scaling or isotonic regression fit "
        "separately on {worst_group}) so a given confidence score means the same thing for "
        "every group.",
        "If {worst_group} has a smaller precision at the current operating threshold, consider "
        "a group-aware threshold via Fairlearn's `ThresholdOptimizer` targeting the "
        "`equalized_odds` or a custom precision-parity constraint.",
        "Investigate whether the base rate (true positive prevalence) differs sharply between "
        "groups — predictive parity is mathematically difficult to satisfy jointly with "
        "equalized odds when base rates diverge, so this may require a product/policy decision, "
        "not just a modeling one.",
    ],
}

_TIER_PREFIX = {
    "negligible": "No action required — this metric is within normal variance.",
    "low": "Monitor. Not currently gate-blocking, but track this metric across future model "
    "versions to catch drift early.",
    "moderate": "Recommended before the next deployment window:",
    "high": "Should block deployment until addressed. Recommended remediation:",
    "critical": "Blocks deployment. This is a severe, actionable disparity. Recommended "
    "remediation:",
}


def guidance_for_metric(metric_name: str, tier: str, worst_group: str) -> list[str]:
    """Return remediation guidance strings for a single metric result."""
    prefix = _TIER_PREFIX.get(tier, _TIER_PREFIX["moderate"])
    if tier in ("negligible", "low"):
        return [prefix]

    steps = _BASE_GUIDANCE.get(metric_name, [])
    formatted = [prefix] + [step.format(worst_group=worst_group) for step in steps]
    return formatted
