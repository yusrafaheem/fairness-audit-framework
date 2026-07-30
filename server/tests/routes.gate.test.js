/**
 * HTTP-level integration tests for POST /api/gate.
 *
 * Unlike gate.test.js (which calls evaluateGate directly) and
 * dataStore.test.js (which mocks the filesystem), these tests go
 * through the real Express app, bound to a real ephemeral port via
 * `app.listen(0)`, and talk to it with Node's global `fetch` -- no
 * mocking anywhere in this file. That's possible without corrupting
 * anything because the `domain` path here is entirely read-only
 * (GET-shaped reads under the hood via getAuditReport), so it's safe
 * to run these against the real committed data in server/data/.
 *
 * `app.listen(0)` asks the OS for any free port instead of a fixed one,
 * so these tests can run in parallel with other test files (and with
 * whatever else happens to be running on the machine) without a port
 * collision.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";

let server;
let baseUrl;

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function postGate(body) {
  const res = await fetch(`${baseUrl}/api/gate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("POST /api/gate with a known-passing domain returns passed: true, matching the committed data", async () => {
  const { status, body } = await postGate({ domain: "hiring" });

  assert.equal(status, 200);
  assert.equal(body.passed, true);
  assert.deepEqual(body.blockingMetrics, []);
  assert.equal(body.domain, "hiring");
});

test("POST /api/gate with a known-blocking domain returns passed: false and names the blocking metrics", async () => {
  const { status, body } = await postGate({ domain: "content_moderation" });

  assert.equal(status, 200);
  assert.equal(body.passed, false);
  assert.deepEqual(new Set(body.blockingMetrics), new Set(["demographic_parity", "equalized_odds"]));
});

test("POST /api/gate with an unknown domain returns 404, not a 500", async () => {
  const { status, body } = await postGate({ domain: "does-not-exist" });

  assert.equal(status, 404);
  assert.match(body.error, /does-not-exist/);
});

test("POST /api/gate with neither domain nor report returns 400", async () => {
  const { status, body } = await postGate({});

  assert.equal(status, 400);
  assert.match(body.error, /domain.*report/);
});

test("POST /api/gate accepts a fully inline report and never touches the filesystem for it", async () => {
  const inlineReport = {
    domain: "custom-model",
    metrics: [
      { metric_name: "demographic_parity", severity_score: 12 },
      { metric_name: "equalized_odds", severity_score: 88 },
    ],
  };

  const { status, body } = await postGate({ report: inlineReport });

  assert.equal(status, 200);
  assert.equal(body.passed, false);
  assert.deepEqual(body.blockingMetrics, ["equalized_odds"]);
  assert.equal(body.domain, "custom-model");
});

test("POST /api/gate with custom thresholds can flip a normally-passing metric to blocking", async () => {
  // hiring's equalized_odds severity_score is 25.1, comfortably under
  // the default 70 bar -- but not under a custom bar of 20.
  const { status, body } = await postGate({ domain: "hiring", thresholds: { equalized_odds: 20 } });

  assert.equal(status, 200);
  assert.equal(body.passed, false);
  assert.ok(body.blockingMetrics.includes("equalized_odds"));
});

test("POST /api/gate with a malformed inline report (no metrics array) is handled by the error middleware, not left to crash the process", async () => {
  const { status, body } = await postGate({ report: { domain: "broken" } });

  assert.equal(status, 500);
  assert.match(body.error, /metrics/);
});
