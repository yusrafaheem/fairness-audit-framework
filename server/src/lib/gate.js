/**
 * JavaScript port of engine/fairaudit/gate.py's `evaluate_gate`.
 *
 * Kept intentionally tiny and dependency-free so `POST /api/gate` can
 * evaluate a pre-computed report instantly, without spawning Python for
 * every CI request. The Python implementation remains the source of
 * truth for computing severity scores in the first place (see
 * pythonBridge.js) — this module only re-applies the same threshold
 * comparison to an already-scored report.
 */

export const DEFAULT_BLOCKING_SCORE = 70.0;

/**
 * @param {object} report - an AuditReport-shaped object (see report.py),
 *   specifically `report.metrics: [{ metric_name, severity_score }]`.
 * @param {Record<string, number>} [thresholds] - metric_name -> max
 *   allowed severity score (0-100). Falls back to
 *   DEFAULT_BLOCKING_SCORE for any metric not listed.
 * @returns {{passed: boolean, blockingMetrics: string[], overallSeverityScore: number, overallSeverityTier: string, thresholdsUsed: Record<string, number>, domain: string|null}}
 */
export function evaluateGate(report, thresholds = {}) {
  if (!report || !Array.isArray(report.metrics)) {
    throw new Error("evaluateGate expects a report with a `metrics` array");
  }

  const thresholdsUsed = {};
  for (const m of report.metrics) {
    thresholdsUsed[m.metric_name] = thresholds[m.metric_name] ?? DEFAULT_BLOCKING_SCORE;
  }

  const blockingMetrics = report.metrics
    .filter((m) => m.severity_score >= thresholdsUsed[m.metric_name])
    .map((m) => m.metric_name);

  return {
    passed: blockingMetrics.length === 0,
    blockingMetrics,
    overallSeverityScore: report.overall_severity_score ?? null,
    overallSeverityTier: report.overall_severity_tier ?? null,
    thresholdsUsed,
    domain: report.domain ?? null,
  };
}
