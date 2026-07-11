"""
Synthetic dataset generators for the three audit domains: hiring, lending,
and content moderation.

Each generator produces a feature matrix, a binary outcome label, and a
binary sensitive attribute (``group_a`` / ``group_b``). The sensitive
attribute is deliberately abstracted rather than tied to a specific
real-world demographic category — it stands in for any legally protected
characteristic (gender, race, age band, disability status, etc.). Swap it
out for a real column name when auditing a real dataset; the rest of the
framework is agnostic to what the groups represent.

Bias is injected into the *label generating process* (not just the raw
features) to simulate the common real-world failure mode where historical
decisions — not the applicant's/borrower's/post's underlying merit — are
what a model learns to reproduce.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class SyntheticDataset:
    """Container for a generated audit dataset."""

    name: str
    features: pd.DataFrame
    labels: pd.Series
    sensitive_features: pd.Series
    feature_names: list[str]

    def train_test_split(self, test_size: float = 0.3, random_state: int = 42):
        from sklearn.model_selection import train_test_split

        return train_test_split(
            self.features,
            self.labels,
            self.sensitive_features,
            test_size=test_size,
            random_state=random_state,
            stratify=self.sensitive_features,
        )


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def make_hiring_dataset(n_samples: int = 4000, bias_strength: float = 0.7, seed: int = 7) -> SyntheticDataset:
    """Simulate a resume-screening / hiring-decision dataset.

    Core merit features (years_experience, technical_score,
    interview_score, education_level) are drawn from the *same*
    distribution for both groups — there is no underlying qualification
    gap. A fifth feature, ``professional_network_score``, stands in for
    referral / professional-network access, which is documented to differ
    systematically by group even among equally qualified candidates; it is
    drawn from a slightly lower distribution for group_b. That proxy
    feature, plus an additional direct penalty applied to the *historical*
    "was_hired" label itself (mimicking biased human reviewers), together
    let a model trained on features alone — with no direct access to
    group membership — still reproduce a detectable hiring disparity,
    exactly the failure mode this framework is built to catch.
    """
    rng = np.random.default_rng(seed)
    n_a = n_samples // 2
    n_b = n_samples - n_a

    group = np.array(["group_a"] * n_a + ["group_b"] * n_b)

    years_experience = rng.gamma(shape=3.0, scale=2.0, size=n_samples).clip(0, 25)
    education_level = rng.integers(1, 5, size=n_samples)  # 1=HS, 2=Assoc, 3=BA, 4=Grad
    technical_score = rng.normal(70, 12, size=n_samples).clip(0, 100)
    interview_score = rng.normal(70, 15, size=n_samples).clip(0, 100)
    extracurriculars = rng.poisson(1.5, size=n_samples)
    professional_network_score = np.where(
        group == "group_a",
        rng.normal(62, 15, size=n_samples),
        rng.normal(48, 15, size=n_samples),
    ).clip(0, 100)

    merit = (
        0.05 * years_experience
        + 0.6 * education_level
        + 0.04 * technical_score
        + 0.03 * interview_score
        + 0.1 * extracurriculars
        + 0.02 * professional_network_score
    )
    merit = (merit - merit.mean()) / merit.std()

    bias_penalty = np.where(group == "group_b", -bias_strength, 0.0)
    logits = 1.1 * merit + bias_penalty - 0.6
    p_hired = _sigmoid(logits)
    was_hired = rng.binomial(1, p_hired)

    features = pd.DataFrame(
        {
            "years_experience": years_experience,
            "education_level": education_level,
            "technical_score": technical_score,
            "interview_score": interview_score,
            "extracurriculars": extracurriculars,
            "professional_network_score": professional_network_score,
        }
    )

    return SyntheticDataset(
        name="hiring",
        features=features,
        labels=pd.Series(was_hired, name="was_hired"),
        sensitive_features=pd.Series(group, name="applicant_group"),
        feature_names=list(features.columns),
    )


def make_lending_dataset(n_samples: int = 4000, bias_strength: float = 0.6, seed: int = 11) -> SyntheticDataset:
    """Simulate a loan-approval dataset.

    Core financial merit features (income, credit_score, debt_to_income,
    employment_years) are drawn identically for both groups. A fifth
    feature, ``zip_code_wealth_index``, stands in for neighborhood-level
    wealth indicators historically used (directly or indirectly) in
    underwriting — a well-documented redlining-adjacent proxy — and is
    drawn from a lower distribution for group_b. Combined with an
    additional direct penalty on the historical "was_approved" label, a
    model trained on features alone still reproduces a detectable lending
    disparity, even without ever seeing group membership directly.
    """
    rng = np.random.default_rng(seed)
    n_a = n_samples // 2
    n_b = n_samples - n_a

    group = np.array(["group_a"] * n_a + ["group_b"] * n_b)

    income = rng.lognormal(mean=10.8, sigma=0.45, size=n_samples).clip(15_000, 300_000)
    credit_score = rng.normal(680, 60, size=n_samples).clip(300, 850)
    debt_to_income = rng.beta(2, 5, size=n_samples) * 0.8
    employment_years = rng.gamma(shape=2.5, scale=2.2, size=n_samples).clip(0, 35)
    loan_amount = rng.lognormal(mean=10.0, sigma=0.5, size=n_samples).clip(2_000, 200_000)
    zip_code_wealth_index = np.where(
        group == "group_a",
        rng.normal(66, 18, size=n_samples),
        rng.normal(50, 18, size=n_samples),
    ).clip(0, 100)

    merit = (
        0.00002 * income
        + 0.01 * credit_score
        - 3.0 * debt_to_income
        + 0.05 * employment_years
        - 0.000008 * loan_amount
        + 0.015 * zip_code_wealth_index
    )
    merit = (merit - merit.mean()) / merit.std()

    bias_penalty = np.where(group == "group_b", -bias_strength, 0.0)
    logits = 1.0 * merit + bias_penalty - 0.3
    p_approved = _sigmoid(logits)
    was_approved = rng.binomial(1, p_approved)

    features = pd.DataFrame(
        {
            "income": income,
            "credit_score": credit_score,
            "debt_to_income": debt_to_income,
            "employment_years": employment_years,
            "loan_amount": loan_amount,
            "zip_code_wealth_index": zip_code_wealth_index,
        }
    )

    return SyntheticDataset(
        name="lending",
        features=features,
        labels=pd.Series(was_approved, name="was_approved"),
        sensitive_features=pd.Series(group, name="applicant_group"),
        feature_names=list(features.columns),
    )


def make_content_moderation_dataset(n_samples: int = 4000, bias_strength: float = 0.5, seed: int = 19) -> SyntheticDataset:
    """Simulate a toxicity/content-moderation flagging dataset.

    Core content-signal features (num_reports, prior_violations,
    text_length, account_age_days) are drawn identically for both groups.
    A fifth feature, ``dialect_classifier_score``, stands in for an
    upstream NLP toxicity/dialect classifier's raw score — mirroring
    documented real-world findings that some automated toxicity
    classifiers over-flag certain dialects/writing styles (Sap et al.,
    2019, "The Risk of Racial Bias in Hate Speech Detection") — and is
    drawn from a higher distribution for group_b. Combined with an
    additional direct penalty on the historical "was_removed" label, a
    downstream moderation model trained on features alone still
    reproduces a detectable disparity, without ever seeing group
    membership directly.
    """
    rng = np.random.default_rng(seed)
    n_a = n_samples // 2
    n_b = n_samples - n_a

    group = np.array(["group_a"] * n_a + ["group_b"] * n_b)

    num_reports = rng.poisson(1.2, size=n_samples)
    prior_violations = rng.poisson(0.4, size=n_samples)
    text_length = rng.integers(5, 400, size=n_samples)
    account_age_days = rng.gamma(shape=2.0, scale=180, size=n_samples).clip(0, 4000)
    dialect_classifier_score = np.where(
        group == "group_a",
        rng.beta(2, 7, size=n_samples),
        rng.beta(3, 5, size=n_samples),
    )

    merit = (
        4.0 * dialect_classifier_score
        + 0.5 * num_reports
        + 0.8 * prior_violations
        - 0.0015 * account_age_days
    )
    merit = (merit - merit.mean()) / merit.std()

    bias_penalty = np.where(group == "group_b", bias_strength, 0.0)
    logits = 1.0 * merit + bias_penalty - 1.2
    p_removed = _sigmoid(logits)
    was_removed = rng.binomial(1, p_removed)
    # Positive class = favorable outcome (content stays up), matching the
    # "positive is good" convention used by the hiring and lending
    # domains. This keeps `worst_group` (defined generically as "lower
    # selection rate") semantically correct everywhere: without this
    # flip, a *higher* removal rate for group_b would confusingly show up
    # as group_a being the "worst" group under the generic metric code.
    content_approved = 1 - was_removed

    features = pd.DataFrame(
        {
            "dialect_classifier_score": dialect_classifier_score,
            "num_reports": num_reports,
            "prior_violations": prior_violations,
            "text_length": text_length,
            "account_age_days": account_age_days,
        }
    )

    return SyntheticDataset(
        name="content_moderation",
        features=features,
        labels=pd.Series(content_approved, name="content_approved"),
        sensitive_features=pd.Series(group, name="author_group"),
        feature_names=list(features.columns),
    )


DOMAIN_GENERATORS = {
    "hiring": make_hiring_dataset,
    "lending": make_lending_dataset,
    "content_moderation": make_content_moderation_dataset,
}


def get_dataset(domain: str, **kwargs) -> SyntheticDataset:
    if domain not in DOMAIN_GENERATORS:
        raise ValueError(f"Unknown domain '{domain}'. Choose from {list(DOMAIN_GENERATORS)}.")
    return DOMAIN_GENERATORS[domain](**kwargs)
