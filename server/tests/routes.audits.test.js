/**
 * HTTP-level integration tests for /api/audits/* and /api/health.
 *
 * The GET routes are exercised against the real committed demo data in
 * server/data/ (same reasoning as routes.gate.test.js: they're
 * read-only, so there's nothing to corrupt).
 *
 * PYTHON_BIN is forced to a nonexistent path for this entire file,
 * before app.js (and transitively pythonBridge.js) is ever imported --
 * app.js is imported *dynamically*, inside `before()`, specifically so
 * that env var is in place before pythonBridge.js's module-level
 * `const PYTHON_BIN = process.env.PYTHON_BIN || "python3"` runs. None
 * of the tests in this file need a real Python install: the GET routes
 * never touch pythonBridge.js at all, and the one POST /:domain/run
 * test is deliberately testing the *unhappy* path (Python unavailable),
 * which is exactly what CI will hit anyway since it doesn't install
 * Fairlearn for the Node job.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

let server;
let baseUrl;

before(async () => {
  process.env.PYTHON_BIN = "/definitely/not/a/real/python-xyz123";
  const { createApp } = await import("../src/app.js");
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete process.env.PYTHON_BIN;
});

async function get(urlPath) {
  const res = await fetch(`${baseUrl}${urlPath}`);
  return { status: res.status, body: await res.json() };
}

async function post(urlPath) {
  const res = await fetch(`${baseUrl}${urlPath}`, { method: "POST" });
  return { status: res.status, body: await res.json() };
}

test("GET /api/health reports ok", async () => {
  const { status, body } = await get("/api/health");

  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.service, "fairaudit-server");
});

test("GET /api/audits returns the index of all domains, matching the committed severity/gate data", async () => {
  const { status, body } = await get("/api/audits");

  assert.equal(status, 200);
  assert.ok(Array.isArray(body.domains));
  const contentModeration = body.domains.find((d) => d.domain === "content_moderation");
  assert.ok(contentModeration, "expected content_moderation in the index");
  assert.equal(contentModeration.gate_pass, false);
  assert.equal(contentModeration.overall_severity_tier, "high");
});

test("GET /api/audits/:domain returns the full report for a known domain", async () => {
  const { status, body } = await get("/api/audits/hiring");

  assert.equal(status, 200);
  assert.equal(body.domain, "hiring");
  assert.equal(body.sensitive_feature_name, "applicant_group");
  assert.equal(body.metrics.length, 3);
});

test("GET /api/audits/:domain returns 404 with the domain name in the message for an unknown domain", async () => {
  const { status, body } = await get("/api/audits/not-a-real-domain");

  assert.equal(status, 404);
  assert.match(body.error, /not-a-real-domain/);
});

test("an unmatched route falls through to the generic 404 handler, not Express's default HTML error page", async () => {
  const { status, body } = await get("/api/totally/made/up");

  assert.equal(status, 404);
  assert.match(body.error, /No route for GET/);
});

test("POST /api/audits/:domain/run surfaces a BridgeError as 502 when the Python engine can't start", async () => {
  const before = await get("/api/audits/hiring");

  const { status, body } = await post("/api/audits/hiring/run");

  assert.equal(status, 502);
  assert.match(body.error, /Could not start the Python engine/);

  // The whole point of failing *before* saveAuditReport is called: the
  // committed demo data must be untouched by a failed run.
  const after_ = await get("/api/audits/hiring");
  assert.deepEqual(after_.body, before.body);
});
