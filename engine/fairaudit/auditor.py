"""
FairnessAuditor — the main entry point.

The auditor itself never touches a model object. It takes ``y_true``,
``y_pred`` (and optionally ``y_score``), and ``sensitive_features`` —
that is the entire contract. That's what makes it model-agnostic: a
scikit-learn pipeline, an XGBoost booster, a hand-written rules engine, or
predictions pulled from a third-party vendor's API all look identical to
the auditor once they've produced a column of 0/1 predictions.

``FairnessAuditor.audit_domain`` is a convenience wrapper used by the demo
CLI and the seed-data script: it generates one of the three synthetic
datasets, trains the domain's "production-style" model, and audits it in
one call. Real usage in a CI pipeline would instead call
``FairnessAuditor.audit`` directly with your own model's predictions.
"""

from __future__ import annotations

from .gate import GateResult, evaluate_gate
from .metrics import compute_all_metrics
from .remediation import guidance_for_metric
from .report import AuditReport, MetricResult
from .severity import difference_to_severity, four_fifths_check, overall_severity


class FairnessAuditor:
    def __init__(self, gate_thresholds: dict[str, float] | None = None):
        self.gate_thresholds = gate_thresholds or {}

    def audit(
        self,
        y_true,
        y_pred,
        sensitive_features,
        *,
        domain: str = "custom",
        model_kind: str = "unspecified",
    ) -> AuditReport:
        """Run a full fairness audit on model-agnostic prediction output.

        Parameters
        ----------
        y_true : array-like of 0/1
            Ground-truth outcomes.
        y_pred : array-like of 0/1
            Model predictions (thresholded, not probability scores).
        sensitive_features : array-like
            Group membership for each sample (e.g. "group_a" / "group_b").
        domain : str
            Free-text label for the report (e.g. "hiring", "lending").
        model_kind : str
            Free-text label describing the model that produced ``y_pred``.
        """
        raw_metrics = compute_all_metrics(y_true, y_pred, sensitive_features)

        metric_results: list[MetricResult] = []
        severities = {}
        for name, gm in raw_metrics.items():
            sev = difference_to_severity(gm.difference)
            severities[name] = sev
            passes_4_5 = four_fifths_check(gm.ratio) if name == "demographic_parity" else None
            remediation = guidance_for_metric(name, sev.tier, gm.worst_group)
            metric_results.append(
                MetricResult(
                    metric_name=gm.metric_name,
                    difference=round(gm.difference, 4),
                    ratio=round(gm.ratio, 4) if gm.ratio is not None else None,
                    by_group=gm.by_group,
                    worst_group=gm.worst_group,
                    best_group=gm.best_group,
                    severity_score=sev.score,
                    severity_tier=sev.tier,
                    passes_four_fifths_rule=passes_4_5,
                    remediation=remediation,
                )
            )

        overall = overall_severity(severities)
        groups = sorted(set(str(g) for g in sensitive_features))

        report = AuditReport.new(
            domain=domain,
            model_kind=model_kind,
            n_test_samples=len(list(y_true)),
            sensitive_feature_name=getattr(sensitive_features, "name", "sensitive_feature") or "sensitive_feature",
            groups=groups,
            metrics=metric_results,
            overall_severity_score=overall.score,
            overall_severity_tier=overall.tier,
            gate_pass=False,  # filled in below
            gate_thresholds={},
        )

        gate_result = evaluate_gate(report, thresholds=self.gate_thresholds)
        report.gate_pass = gate_result.passed
        report.gate_thresholds = gate_result.thresholds_used

        return report

    def audit_domain(self, domain: str, model_kind: str | None = None) -> AuditReport:
        """Convenience method: generate the synthetic dataset for
        ``domain``, train its production-style model, and audit it."""
        from .datasets import get_dataset
        from .models import train_domain_model

        dataset = get_dataset(domain)
        trained = train_domain_model(dataset, model_kind=model_kind)

        return self.audit(
            y_true=trained.y_test,
            y_pred=trained.y_pred,
            sensitive_features=trained.sensitive_test,
            domain=domain,
            model_kind=trained.model_kind,
        )

    def gate(self, report: AuditReport) -> GateResult:
        return evaluate_gate(report, thresholds=self.gate_thresholds)
