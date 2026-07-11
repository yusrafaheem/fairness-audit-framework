"""
Model-agnostic fairness metric computation.

Every function here takes only ``y_true``, ``y_pred``, and
``sensitive_features`` — plain arrays/Series — never the model itself.
That is what makes the framework model-agnostic: it works identically
whether predictions came from a scikit-learn pipeline, an XGBoost model,
a rules engine, or a third-party API response, as long as you can hand it
binary outcomes and a group label.

Three fairness criteria are computed, each capturing a different notion
of "fair":

* **Demographic parity** — are positive-outcome rates equal across
  groups, regardless of whether the outcome is actually warranted?
* **Equalized odds** — conditional on the true outcome, are the model's
  true-positive and false-positive rates equal across groups?
* **Predictive parity** — conditional on a positive prediction, is the
  precision (the chance the prediction is actually correct) equal across
  groups?

All three are reported as the *difference* between the best- and
worst-performing group (0 = perfectly parity, larger = more disparity),
using Fairlearn's ``MetricFrame`` so the by-group breakdown is preserved
alongside the summary number.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from fairlearn.metrics import (
    MetricFrame,
    demographic_parity_difference,
    demographic_parity_ratio,
    equalized_odds_difference,
    false_positive_rate,
    selection_rate,
    true_positive_rate,
)
from sklearn.metrics import precision_score


@dataclass
class GroupMetric:
    """A fairness metric's overall difference plus its per-group breakdown."""

    metric_name: str
    difference: float
    ratio: float | None
    by_group: dict[str, float]
    worst_group: str
    best_group: str


def _precision_by_group(y_true, y_pred, sensitive_features) -> MetricFrame:
    return MetricFrame(
        metrics=lambda yt, yp: precision_score(yt, yp, zero_division=0.0),
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sensitive_features,
    )


def compute_demographic_parity(y_true, y_pred, sensitive_features) -> GroupMetric:
    frame = MetricFrame(
        metrics=selection_rate,
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sensitive_features,
    )
    by_group = frame.by_group.to_dict()
    diff = demographic_parity_difference(y_true, y_pred, sensitive_features=sensitive_features)
    ratio = demographic_parity_ratio(y_true, y_pred, sensitive_features=sensitive_features)
    worst = min(by_group, key=by_group.get)
    best = max(by_group, key=by_group.get)
    return GroupMetric(
        metric_name="demographic_parity",
        difference=float(diff),
        ratio=float(ratio),
        by_group={k: float(v) for k, v in by_group.items()},
        worst_group=worst,
        best_group=best,
    )


def compute_equalized_odds(y_true, y_pred, sensitive_features) -> GroupMetric:
    tpr_frame = MetricFrame(
        metrics=true_positive_rate,
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sensitive_features,
    )
    fpr_frame = MetricFrame(
        metrics=false_positive_rate,
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sensitive_features,
    )
    diff = equalized_odds_difference(y_true, y_pred, sensitive_features=sensitive_features)

    tpr_by_group = tpr_frame.by_group.to_dict()
    fpr_by_group = fpr_frame.by_group.to_dict()
    # Report whichever sub-metric (TPR or FPR) drives the larger gap, since
    # equalized_odds_difference is itself max(TPR gap, FPR gap).
    tpr_gap = max(tpr_by_group.values()) - min(tpr_by_group.values())
    fpr_gap = max(fpr_by_group.values()) - min(fpr_by_group.values())
    driving = tpr_by_group if tpr_gap >= fpr_gap else fpr_by_group

    worst = min(driving, key=driving.get)
    best = max(driving, key=driving.get)

    return GroupMetric(
        metric_name="equalized_odds",
        difference=float(diff),
        ratio=None,
        by_group={
            group: {"tpr": float(tpr_by_group[group]), "fpr": float(fpr_by_group[group])}
            for group in tpr_by_group
        },
        worst_group=worst,
        best_group=best,
    )


def compute_predictive_parity(y_true, y_pred, sensitive_features) -> GroupMetric:
    frame = _precision_by_group(y_true, y_pred, sensitive_features)
    by_group = frame.by_group.to_dict()
    diff = float(max(by_group.values()) - min(by_group.values()))
    worst = min(by_group, key=by_group.get)
    best = max(by_group, key=by_group.get)
    return GroupMetric(
        metric_name="predictive_parity",
        difference=diff,
        ratio=None,
        by_group={k: float(v) for k, v in by_group.items()},
        worst_group=worst,
        best_group=best,
    )


def compute_all_metrics(y_true, y_pred, sensitive_features) -> dict[str, GroupMetric]:
    """Compute demographic parity, equalized odds, and predictive parity
    in one call. This is the primary entry point used by
    :class:`fairaudit.auditor.FairnessAuditor`."""
    y_true = pd.Series(y_true).reset_index(drop=True)
    y_pred = pd.Series(y_pred).reset_index(drop=True)
    sensitive_features = pd.Series(sensitive_features).reset_index(drop=True)

    if y_true.nunique() > 2 or y_pred.nunique() > 2:
        raise ValueError("fairaudit currently supports binary outcomes only.")
    if sensitive_features.nunique() < 2:
        raise ValueError("sensitive_features must contain at least two distinct groups.")

    return {
        "demographic_parity": compute_demographic_parity(y_true, y_pred, sensitive_features),
        "equalized_odds": compute_equalized_odds(y_true, y_pred, sensitive_features),
        "predictive_parity": compute_predictive_parity(y_true, y_pred, sensitive_features),
    }
