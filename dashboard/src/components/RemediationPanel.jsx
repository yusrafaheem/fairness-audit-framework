export default function RemediationPanel({ remediation }) {
  if (!remediation || remediation.length === 0) return null;

  const [headline, ...steps] = remediation;

  return (
    <div className="remediation-panel">
      <p className="remediation-headline">{headline}</p>
      {steps.length > 0 && (
        <ul className="remediation-steps">
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
