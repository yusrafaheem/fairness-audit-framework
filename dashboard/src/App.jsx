import { useCallback, useEffect, useState } from "react";
import { fetchAuditIndex, fetchAuditReport, runLiveAudit } from "./api.js";
import AuditSummaryCard from "./components/AuditSummaryCard.jsx";
import DomainTabs from "./components/DomainTabs.jsx";
import MetricsPanel from "./components/MetricsPanel.jsx";

export default function App() {
  const [index, setIndex] = useState(null);
  const [activeDomain, setActiveDomain] = useState(null);
  const [report, setReport] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState(null);

  useEffect(() => {
    fetchAuditIndex()
      .then((idx) => {
        setIndex(idx);
        if (idx.domains?.length) setActiveDomain(idx.domains[0].domain);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const loadReport = useCallback((domain) => {
    setReport(null);
    setRunError(null);
    fetchAuditReport(domain)
      .then(setReport)
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (activeDomain) loadReport(activeDomain);
  }, [activeDomain, loadReport]);

  const handleRunLive = async () => {
    if (!activeDomain) return;
    setIsRunning(true);
    setRunError(null);
    try {
      const freshReport = await runLiveAudit(activeDomain);
      setReport(freshReport);
      const freshIndex = await fetchAuditIndex();
      setIndex(freshIndex);
    } catch (err) {
      setRunError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>fairaudit</h1>
          <p className="app-tagline">Algorithmic Fairness Auditing Framework</p>
        </div>
        <p className="app-header-note">
          Demographic parity · Equalized odds · Predictive parity — with severity scoring and remediation guidance,
          gating every model before it ships.
        </p>
      </header>

      {loadError && (
        <div className="load-error">
          Couldn't reach the fairaudit API ({loadError}). Is the server running? See the README's "Running locally"
          section.
        </div>
      )}

      {index && (
        <DomainTabs domains={index.domains} activeDomain={activeDomain} onSelect={setActiveDomain} />
      )}

      {report && (
        <main className="app-main">
          <AuditSummaryCard
            report={report}
            onRunLive={handleRunLive}
            isRunning={isRunning}
            runError={runError}
          />
          <div className="metrics-grid">
            {report.metrics.map((m) => (
              <MetricsPanel key={m.metric_name} metric={m} />
            ))}
          </div>
        </main>
      )}

      <footer className="app-footer">
        <p>
          Model-agnostic fairness auditing — built with scikit-learn, Fairlearn, Express, and React. Consumable as a
          library, a CLI, or a REST API pre-deployment quality gate.
        </p>
      </footer>
    </div>
  );
}
