import SeverityBadge from "./SeverityBadge.jsx";

const DOMAIN_LABELS = {
  hiring: "Hiring",
  lending: "Lending",
  content_moderation: "Content Moderation",
};

export default function DomainTabs({ domains, activeDomain, onSelect }) {
  return (
    <nav className="domain-tabs">
      {domains.map((d) => (
        <button
          key={d.domain}
          className={`domain-tab ${d.domain === activeDomain ? "domain-tab-active" : ""}`}
          onClick={() => onSelect(d.domain)}
        >
          <span className="domain-tab-label">{DOMAIN_LABELS[d.domain] || d.domain}</span>
          <span className="domain-tab-meta">
            <SeverityBadge score={d.overall_severity_score} tier={d.overall_severity_tier} size="sm" />
            <span className={`gate-pill ${d.gate_pass ? "gate-pass" : "gate-fail"}`}>
              {d.gate_pass ? "Gate: pass" : "Gate: blocked"}
            </span>
          </span>
        </button>
      ))}
    </nav>
  );
}
