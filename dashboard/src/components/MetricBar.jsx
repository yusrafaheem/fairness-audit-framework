/**
 * A single horizontal bar representing one group's rate for a metric,
 * with a light-weight CSS-only implementation (no charting library) —
 * keeps the dashboard's dependency footprint to just React + Vite.
 */
export default function MetricBar({ label, value, isWorst, max = 1 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="metric-bar-row">
      <div className="metric-bar-label">
        {label}
        {isWorst && <span className="metric-bar-flag">disadvantaged</span>}
      </div>
      <div className="metric-bar-track">
        <div
          className={`metric-bar-fill ${isWorst ? "metric-bar-fill-worst" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="metric-bar-value">{(value * 100).toFixed(1)}%</div>
    </div>
  );
}
