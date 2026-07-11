import { Router } from "express";
import { getAuditReport, listAudits, saveAuditReport } from "../lib/dataStore.js";
import { BridgeError, runAudit } from "../pythonBridge.js";

const router = Router();

/** GET /api/audits — summary list of every domain's latest audit. */
router.get("/", async (_req, res, next) => {
  try {
    const index = await listAudits();
    res.json(index);
  } catch (err) {
    next(err);
  }
});

/** GET /api/audits/:domain — full report for one domain. */
router.get("/:domain", async (req, res, next) => {
  try {
    const report = await getAuditReport(req.params.domain);
    if (!report) {
      return res.status(404).json({ error: `No audit report found for domain "${req.params.domain}".` });
    }
    res.json(report);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/audits/:domain/run — re-run the audit live via the Python
 * engine (trains a fresh model on the synthetic dataset and re-audits
 * it) and persist the result. This is the "pre-deployment quality gate"
 * entry point a CI pipeline would call.
 */
router.post("/:domain/run", async (req, res, next) => {
  try {
    const report = await runAudit(req.params.domain);
    await saveAuditReport(req.params.domain, report);
    res.json(report);
  } catch (err) {
    if (err instanceof BridgeError) {
      return res.status(502).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
