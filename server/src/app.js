/**
 * Builds and configures the Express app, but does NOT call `.listen()`.
 *
 * Split out of index.js so the app can be imported directly by tests
 * (supertest-less HTTP integration tests bind this to an ephemeral port
 * via `app.listen(0)` instead) without the side effect of binding to a
 * real port just by importing the module. Same rationale as
 * flask-auth-service's `create_app()` factory: production code and test
 * code should be able to construct "the app" without also starting a
 * server neither of them asked for.
 */

import "dotenv/config";
import cors from "cors";
import express from "express";
import auditsRouter from "./routes/audits.js";
import gateRouter from "./routes/gate.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "fairaudit-server" });
  });

  app.use("/api/audits", auditsRouter);
  app.use("/api/gate", gateRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error(err);
    // express.json() rejects a malformed request body by calling next()
    // with a SyntaxError that carries .status/.statusCode = 400 -- that
    // got silently discarded here before, so a client sending broken
    // JSON saw a generic 500 ("our fault") instead of a 400 ("your
    // request was malformed"), which is both the wrong status code and
    // actively misleading about whose bug to go look at.
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message || "Internal server error" });
  });

  return app;
}
