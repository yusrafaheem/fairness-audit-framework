import { Router } from "express";
import { getAuditReport } from "../lib/dataStore.js";
import { evaluateGate } from "../lib/gate.js";

const router = Router();

/**
 * POST /api/gate — the pre-deployment quality gate endpoint.
 *
 * Two ways to call it:
 *
 *   1. { "domain": "hiring", "thresholds": { "equalized_odds": 50 } }
 *      Evaluates the gate against the most recently saved report for a
 *      known domain (see GET /api/audits/:domain). `thresholds` is
 *      optional and overrides the default per-metric blocking score
 *      (70) for any metric you list.
 *
 *   2. { "report": { ... AuditReport JSON ... }, "thresholds": { ... } }
 *      Evaluates the gate against a report you POST directly — this is
 *      the fully model-agnostic path: a CI job can run
 *      `fairaudit audit --domain custom --output report.json` (or hit
 *      any other model's predictions through the Python library) and
 *      forward the resulting JSON here without this server needing to
 *      know anything about your model or dataset.
 *
 * Responds 200 with { passed: boolean, ... } either way — pass/fail is
 * communicated in the body, not the HTTP status, since a "fair" result
 * of `passed: false` is a completely valid, successful API response.
 */
router.post("/", async (req, res, next) => {
  try {
    const { domain, report: inlineReport, thresholds = {} } = req.body || {};

    let report = inlineReport;
    if (!report) {
      if (!domain) {
        return res.status(400).json({ error: "Provide either `domain` or an inline `report` in the request body." });
      }
      report = await getAuditReport(domain);
      if (!report) {
        return res.status(404).json({ error: `No audit report found for domain "${domain}". Run POST /api/audits/${domain}/run first.` });
      }
    }

    const result = evaluateGate(report, thresholds);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
