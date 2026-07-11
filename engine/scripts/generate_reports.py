#!/usr/bin/env python3
"""
Regenerate the JSON audit reports checked into `server/data/` (and used as
seed data for the dashboard's demo mode).

    python scripts/generate_reports.py

Equivalent to running `fairaudit audit-all --output-dir ../server/data`,
pulled out as its own script so CI can call it directly without relying on
the package being installed in editable mode.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fairaudit.auditor import FairnessAuditor
from fairaudit.datasets import DOMAIN_GENERATORS

OUTPUT_DIR = Path(__file__).resolve().parents[2] / "server" / "data"


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    auditor = FairnessAuditor()

    summaries = []
    for domain in DOMAIN_GENERATORS:
        report = auditor.audit_domain(domain)
        out_path = OUTPUT_DIR / f"{domain}.json"
        out_path.write_text(report.to_json())
        summaries.append((domain, report.overall_severity_score, report.overall_severity_tier, report.gate_pass))
        print(f"[{domain}] severity={report.overall_severity_score} ({report.overall_severity_tier}) "
              f"gate={'PASSED' if report.gate_pass else 'FAILED'} -> {out_path}")

    index = {
        "generated_by": "scripts/generate_reports.py",
        "domains": [
            {
                "domain": d,
                "overall_severity_score": score,
                "overall_severity_tier": tier,
                "gate_pass": passed,
            }
            for d, score, tier, passed in summaries
        ],
    }
    (OUTPUT_DIR / "index.json").write_text(__import__("json").dumps(index, indent=2))
    print(f"Wrote index -> {OUTPUT_DIR / 'index.json'}")


if __name__ == "__main__":
    main()
