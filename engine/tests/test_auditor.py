"""End-to-end integration tests: generate a synthetic domain dataset,
train its production-style model, audit it, and check the shape and
sanity of the resulting report. These are the tests that actually
exercise scikit-learn and Fairlearn."""

import pytest

from fairaudit.auditor import FairnessAuditor
from fairaudit.datasets import DOMAIN_GENERATORS


@pytest.mark.parametrize("domain", list(DOMAIN_GENERATORS.keys()))
def test_audit_domain_produces_a_well_formed_report(domain):
    auditor = FairnessAuditor()
    report = auditor.audit_domain(domain)

    assert report.domain == domain
    assert report.n_test_samples > 0
    assert set(report.groups) == {"group_a", "group_b"}
    assert {m.metric_name for m in report.metrics} == {
        "demographic_parity",
        "equalized_odds",
        "predictive_parity",
    }
    for m in report.metrics:
        assert 0 <= m.severity_score <= 100
        assert m.severity_tier in {"negligible", "low", "moderate", "high", "critical"}
        assert m.worst_group in report.groups
        assert m.best_group in report.groups


@pytest.mark.parametrize("domain", list(DOMAIN_GENERATORS.keys()))
def test_synthetic_bias_is_actually_detected(domain):
    """Every domain generator bakes in a deliberate bias against
    group_b. This test is the framework's own self-check: if it stops
    catching this obvious, intentionally-injected disparity, something
    upstream (metrics or severity scoring) is broken."""
    auditor = FairnessAuditor()
    report = auditor.audit_domain(domain)

    dp_metric = next(m for m in report.metrics if m.metric_name == "demographic_parity")
    assert dp_metric.difference > 0.05, (
        f"Expected the injected bias in the '{domain}' synthetic dataset to produce a "
        f"detectable demographic parity gap, got difference={dp_metric.difference}"
    )
    assert dp_metric.worst_group == "group_b"


def test_report_round_trips_through_json():
    auditor = FairnessAuditor()
    report = auditor.audit_domain("hiring")
    payload = report.to_json()

    import json

    parsed = json.loads(payload)
    assert parsed["domain"] == "hiring"
    assert len(parsed["metrics"]) == 3
    assert "gate_pass" in parsed
