"""
Command-line interface for fairaudit.

    $ fairaudit audit --domain hiring
    $ fairaudit audit --domain lending --output reports/lending.json
    $ fairaudit audit-all --output-dir reports/
    $ fairaudit gate --report reports/hiring.json

This is the same code path the Node REST API uses under the hood (it
spawns this CLI as a subprocess and reads the JSON it prints to stdout),
so the CLI and the API can never silently drift out of sync with each
other.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click

from .auditor import FairnessAuditor
from .datasets import DOMAIN_GENERATORS
from .report import AuditReport

DOMAINS = list(DOMAIN_GENERATORS.keys())


@click.group()
@click.version_option()
def main():
    """fairaudit — model-agnostic algorithmic fairness auditing."""


@main.command()
@click.option("--domain", type=click.Choice(DOMAINS), required=True, help="Audit domain to run.")
@click.option("--output", type=click.Path(dir_okay=False), default=None, help="Write JSON report here instead of stdout.")
@click.option("--fail-under-gate", is_flag=True, default=False, help="Exit with status 1 if the gate does not pass.")
def audit(domain: str, output: str | None, fail_under_gate: bool):
    """Run a fairness audit against a domain's synthetic dataset and
    production-style model."""
    auditor = FairnessAuditor()
    report = auditor.audit_domain(domain)
    payload = report.to_json()

    if output:
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        Path(output).write_text(payload)
        click.echo(f"Wrote report to {output}")
    else:
        click.echo(payload)

    click.echo(
        f"\n[{domain}] overall severity: {report.overall_severity_score} "
        f"({report.overall_severity_tier}) — gate {'PASSED' if report.gate_pass else 'FAILED'}",
        err=True,
    )

    if fail_under_gate and not report.gate_pass:
        sys.exit(1)


@main.command(name="audit-all")
@click.option("--output-dir", type=click.Path(file_okay=False), default="reports", help="Directory to write one JSON report per domain.")
def audit_all(output_dir: str):
    """Run audits for every built-in domain (hiring, lending,
    content_moderation) and write one JSON report each."""
    auditor = FairnessAuditor()
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for domain in DOMAINS:
        report = auditor.audit_domain(domain)
        out_path = out_dir / f"{domain}.json"
        out_path.write_text(report.to_json())
        status = "PASSED" if report.gate_pass else "FAILED"
        click.echo(
            f"[{domain}] severity={report.overall_severity_score} "
            f"({report.overall_severity_tier}) gate={status} -> {out_path}"
        )


@main.command()
@click.option("--report", "report_path", type=click.Path(exists=True, dir_okay=False), required=True, help="Path to a JSON report produced by `fairaudit audit`.")
def gate(report_path: str):
    """Evaluate an existing report against the pre-deployment quality
    gate and exit non-zero on failure — designed for CI usage."""
    data = json.loads(Path(report_path).read_text())
    passed = data.get("gate_pass", False)
    tier = data.get("overall_severity_tier", "unknown")
    score = data.get("overall_severity_score", "unknown")

    click.echo(f"domain={data.get('domain')} severity={score} ({tier}) gate={'PASSED' if passed else 'FAILED'}")

    if not passed:
        blocking = [m["metric_name"] for m in data.get("metrics", []) if m["severity_score"] >= 70]
        if blocking:
            click.echo(f"Blocking metrics: {', '.join(blocking)}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
