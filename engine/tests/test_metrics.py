"""
Unit tests for the fairness metric computations.

Each metric is tested against a hand-constructed toy example where the
correct answer is known exactly, rather than only against the synthetic
datasets (which are useful for integration testing but make it harder to
eyeball whether a number is "right"). See test_auditor.py for the
end-to-end integration tests against the synthetic domains.
"""

import numpy as np
import pandas as pd
import pytest

from fairaudit.metrics import (
    compute_demographic_parity,
    compute_equalized_odds,
    compute_predictive_parity,
)


def test_demographic_parity_detects_known_gap():
    # group_a: 8/10 positive predictions. group_b: 2/10 positive predictions.
    sensitive = pd.Series(["group_a"] * 10 + ["group_b"] * 10)
    y_true = pd.Series([1] * 20)  # irrelevant to demographic parity
    y_pred = pd.Series([1] * 8 + [0] * 2 + [1] * 2 + [0] * 8)

    result = compute_demographic_parity(y_true, y_pred, sensitive)

    assert result.by_group["group_a"] == pytest.approx(0.8)
    assert result.by_group["group_b"] == pytest.approx(0.2)
    assert result.difference == pytest.approx(0.6, abs=1e-6)
    assert result.worst_group == "group_b"
    assert result.best_group == "group_a"


def test_demographic_parity_zero_when_selection_rates_equal():
    sensitive = pd.Series(["group_a"] * 10 + ["group_b"] * 10)
    y_true = pd.Series([1] * 20)
    y_pred = pd.Series(([1] * 5 + [0] * 5) * 2)

    result = compute_demographic_parity(y_true, y_pred, sensitive)

    assert result.difference == pytest.approx(0.0, abs=1e-9)


def test_equalized_odds_detects_tpr_gap():
    # Both groups have 5 positive and 5 negative true labels.
    # group_a: model catches 4/5 positives (TPR=0.8). group_b: catches 1/5 (TPR=0.2).
    # False positive rate is 0 for both groups.
    sensitive = pd.Series(["group_a"] * 10 + ["group_b"] * 10)
    y_true = pd.Series(([1] * 5 + [0] * 5) * 2)
    y_pred_a = [1, 1, 1, 1, 0] + [0, 0, 0, 0, 0]
    y_pred_b = [1, 0, 0, 0, 0] + [0, 0, 0, 0, 0]
    y_pred = pd.Series(y_pred_a + y_pred_b)

    result = compute_equalized_odds(y_true, y_pred, sensitive)

    assert result.difference == pytest.approx(0.6, abs=1e-6)
    assert result.worst_group == "group_b"


def test_predictive_parity_matches_precision_by_group():
    # group_a: 4 predicted positive, 3 correct -> precision 0.75
    # group_b: 4 predicted positive, 1 correct -> precision 0.25
    sensitive = pd.Series(["group_a"] * 10 + ["group_b"] * 10)
    y_true_a = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
    y_pred_a = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
    y_true_b = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    y_pred_b = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0]

    y_true = pd.Series(y_true_a + y_true_b)
    y_pred = pd.Series(y_pred_a + y_pred_b)

    result = compute_predictive_parity(y_true, y_pred, sensitive)

    assert result.by_group["group_a"] == pytest.approx(0.75)
    assert result.by_group["group_b"] == pytest.approx(0.25)
    assert result.difference == pytest.approx(0.5, abs=1e-6)
    assert result.worst_group == "group_b"
