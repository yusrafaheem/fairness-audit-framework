import SeverityBadge from "./SeverityBadge.jsx";

const DOMAIN_LABELS = {
  hiring: "Hiring",
  lending: "Lending",
  content_moderation: "Content Moderation",
};

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AuditSummaryCard({ report, onRunLive, isRunning, runError }) {
  return (
    <div className="summary-card">
      <div className="summary-card-top">
        <div>
          <h2>{DOMAIN_LABELS[report.domain] || report.domain}</h2>
          <p className="summary-card-subtitle">
            {report.model_kind.replace(/_/g, " ")} · {report.n_test_samples.toLocaleString()} held-out test samples ·
            audited {formatDate(report.generated_at)}
          </p>
        </div>
        <div className="summary-card-badges">
          <SeverityBadge score={report.overall_severity_score} tier={report.overall_severity_tier} />
          <span className={`gate-pill gate-pill-lg ${report.gate_pass ? "gate-pass" : "gate-fail"}`}>
            {report.gate_pass ? "Pre-deployment gate: PASS" : "Pre-deployment gate: BLOCKED"}
          </span>
        </div>
      </div>

      <div className="summary-card-actions">
        <button className="run-live-btn" onClick={onRunLive} disabled={isRunning}>
          {isRunning ? "Running live audit…" : "Run live audit"}
        </button>
        <span className="run-live-hint">
          Retrains this domain's model and re-runs the full Fairlearn audit via the Python engine.
        </span>
      </div>

      {runError && <p className="run-live-error">{runError}</p>}
    </div>
  );
}
