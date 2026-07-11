"""
Trains "production-style" scikit-learn models for each audit domain.

These are intentionally ordinary models — a logistic regression and a
random forest — with no fairness-aware training. The point is to represent
what a team might plausibly ship without an auditing step in the pipeline,
so the auditor has something realistic (and realistically biased) to catch.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .datasets import SyntheticDataset

ModelKind = Literal["logistic_regression", "random_forest"]

DOMAIN_MODEL_KIND: dict[str, ModelKind] = {
    "hiring": "logistic_regression",
    "lending": "random_forest",
    "content_moderation": "logistic_regression",
}


@dataclass
class TrainedModel:
    domain: str
    model_kind: ModelKind
    pipeline: Pipeline
    X_test: pd.DataFrame
    y_test: pd.Series
    y_pred: pd.Series
    y_score: pd.Series
    sensitive_test: pd.Series


def _build_pipeline(model_kind: ModelKind, random_state: int = 42) -> Pipeline:
    if model_kind == "logistic_regression":
        estimator = LogisticRegression(max_iter=1000, random_state=random_state)
    elif model_kind == "random_forest":
        estimator = RandomForestClassifier(
            n_estimators=200, max_depth=6, random_state=random_state
        )
    else:
        raise ValueError(f"Unknown model_kind '{model_kind}'")

    return Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("clf", estimator),
        ]
    )


def train_domain_model(dataset: SyntheticDataset, model_kind: ModelKind | None = None, random_state: int = 42) -> TrainedModel:
    """Train a model on a SyntheticDataset and return test-set predictions
    plus the held-out sensitive attribute, ready for auditing."""
    model_kind = model_kind or DOMAIN_MODEL_KIND.get(dataset.name, "logistic_regression")

    X_train, X_test, y_train, y_test, sens_train, sens_test = dataset.train_test_split(
        test_size=0.3, random_state=random_state
    )

    pipeline = _build_pipeline(model_kind, random_state=random_state)
    pipeline.fit(X_train, y_train)

    y_pred = pd.Series(pipeline.predict(X_test), index=X_test.index, name="y_pred")
    y_score = pd.Series(pipeline.predict_proba(X_test)[:, 1], index=X_test.index, name="y_score")

    return TrainedModel(
        domain=dataset.name,
        model_kind=model_kind,
        pipeline=pipeline,
        X_test=X_test,
        y_test=y_test,
        y_pred=y_pred,
        y_score=y_score,
        sensitive_test=sens_test,
    )
