const TIER_LABELS = {
  negligible: "Negligible",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export default function SeverityBadge({ score, tier, size = "md" }) {
  const label = TIER_LABELS[tier] || tier;
  return (
    <span className={`severity-badge severity-${tier} severity-${size}`}>
      <span className="severity-dot" />
      {label}
      {typeof score === "number" && <span className="severity-score">{score.toFixed(1)}</span>}
    </span>
  );
}
