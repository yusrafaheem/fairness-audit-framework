"""
fairaudit — a model-agnostic algorithmic fairness auditing framework.

Computes demographic parity, equalized odds, and predictive parity across
protected groups, converts the results into a 0-100 severity score, and
attaches rule-based remediation guidance. Designed to run as a pre-deployment
quality gate, either as a library, a CLI, or behind a REST API.
"""

from .auditor import FairnessAuditor
from .report import AuditReport, MetricResult
from .gate import evaluate_gate, GateResult

__all__ = [
    "FairnessAuditor",
    "AuditReport",
    "MetricResult",
    "evaluate_gate",
    "GateResult",
]

__version__ = "0.1.0"
