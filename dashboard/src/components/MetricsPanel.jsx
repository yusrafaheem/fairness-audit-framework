import MetricBar from "./MetricBar.jsx";
import RemediationPanel from "./RemediationPanel.jsx";
import SeverityBadge from "./SeverityBadge.jsx";

const METRIC_META = {
  demographic_parity: {
    label: "Demographic Parity",
    description: "Are positive-outcome rates equal across groups, regardless of whether the outcome is warranted?",
  },
  equalized_odds: {
    label: "Equalized Odds",
    description: "Conditional on the true outcome, are true-positive and false-positive rates equal across groups?",
  },
  predictive_parity: {
    label: "Predictive Parity",
    description: "Conditional on a positive prediction, is precision (how often it's actually correct) equal across groups?",
  },
};

function isEqualizedOddsShape(byGroup) {
  const first = Object.values(byGroup)[0];
  return first && typeof first === "object" && "tpr" in first;
}

export default function MetricsPanel({ metric }) {
  const meta = METRIC_META[metric.metric_name] || { label: metric.metric_name, description: "" };
  const eoShape = isEqualizedOddsShape(metric.by_group);

  return (
    <section className={`metric-panel metric-panel-${metric.severity_tier}`}>
      <header className="metric-panel-header">
        <div>
          <h3>{meta.label}</h3>
          <p className="metric-panel-description">{meta.description}</p>
        </div>
        <SeverityBadge score={metric.severity_score} tier={metric.severity_tier} />
      </header>

      <div className="metric-panel-stats">
        <div className="metric-stat">
          <span className="metric-stat-label">Difference</span>
          <span className="metric-stat-value">{(metric.difference * 100).toFixed(1)} pts</span>
        </div>
        {metric.ratio !== null && metric.ratio !== undefined && (
          <div className="metric-stat">
            <span className="metric-stat-label">Selection-rate ratio</span>
            <span className="metric-stat-value">{metric.ratio.toFixed(2)}</span>
          </div>
        )}
        {metric.passes_four_fifths_rule !== null && metric.passes_four_fifths_rule !== undefined && (
          <div className={`metric-stat four-fifths ${metric.passes_four_fifths_rule ? "pass" : "fail"}`}>
            <span className="metric-stat-label">EEOC four-fifths rule</span>
            <span className="metric-stat-value">{metric.passes_four_fifths_rule ? "Passes (≥ 0.8)" : "Fails (< 0.8)"}</span>
          </div>
        )}
      </div>

      <div className="metric-panel-bars">
        {eoShape ? (
          <>
            <p className="metric-bar-group-label">True positive rate</p>
            {Object.entries(metric.by_group).map(([group, vals]) => (
              <MetricBar key={`${group}-tpr`} label={group} value={vals.tpr} isWorst={group === metric.worst_group} />
            ))}
            <p className="metric-bar-group-label">False positive rate</p>
            {Object.entries(metric.by_group).map(([group, vals]) => (
              <MetricBar key={`${group}-fpr`} label={group} value={vals.fpr} isWorst={group === metric.worst_group} />
            ))}
          </>
        ) : (
          Object.entries(metric.by_group).map(([group, value]) => (
            <MetricBar key={group} label={group} value={value} isWorst={group === metric.worst_group} />
          ))
        )}
      </div>

      <RemediationPanel remediation={metric.remediation} />
    </section>
  );
}
