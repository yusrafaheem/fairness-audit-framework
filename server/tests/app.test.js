/**
 * Tests for app.js's own middleware stack, independent of any one
 * route: CORS, body parsing/limits, the catch-all 404, and the error
 * handler. Where routes.gate.test.js and routes.audits.test.js ask
 * "does this endpoint behave correctly," this file asks "does the
 * plumbing every endpoint sits on top of behave correctly."
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

// -- malformed body -> 400, not 500 (the bug fixed a couple commits ago) --

test("a syntactically broken JSON body returns 400 with a JSON error body, not a 500", async () => {
  const res = await fetch(`${baseUrl}/api/gate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not valid json",
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.ok(body.error, "expected a JSON body with an `error` field, not an empty/HTML response");
});

test("an empty body with a JSON content-type is treated as an empty object, not a parse error", async () => {
  const res = await fetch(`${baseUrl}/api/gate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "",
  });
  const body = await res.json();

  // express.json() treats a zero-length body as "no body" rather than
  // invalid JSON -- this should fall through to the route's own
  // "provide domain or report" 400, not the body-parser's 400.
  assert.equal(res.status, 400);
  assert.match(body.error, /domain.*report/);
});

// -- CORS ------------------------------------------------------------------

test("responses include a permissive CORS header", async () => {
  const res = await fetch(`${baseUrl}/api/health`);

  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("a CORS preflight OPTIONS request is answered without hitting any route handler", async () => {
  const res = await fetch(`${baseUrl}/api/audits/hiring`, {
    method: "OPTIONS",
    headers: {
      "access-control-request-method": "GET",
      origin: "https://example.com",
    },
  });

  assert.ok(res.status === 204 || res.status === 200, `expected a 2xx preflight response, got ${res.status}`);
});

// -- catch-all 404 ------------------------------------------------------

test("an unmatched GET route 404s with the method and path in the message", async () => {
  const res = await fetch(`${baseUrl}/api/nonexistent`);
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.match(body.error, /No route for GET \/api\/nonexistent/);
});

test("an unmatched DELETE route 404s too, with DELETE (not GET) named in the message", async () => {
  const res = await fetch(`${baseUrl}/api/audits`, { method: "DELETE" });
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.match(body.error, /No route for DELETE/);
});

test("PUT to a GET-only route (/api/audits/hiring) 404s rather than being silently accepted", async () => {
  const res = await fetch(`${baseUrl}/api/audits/hiring`, { method: "PUT" });

  assert.equal(res.status, 404);
});

test("the bare root path has no route and 404s through the same catch-all", async () => {
  const res = await fetch(`${baseUrl}/`);
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.match(body.error, /No route for GET \//);
});

// -- request size limit --------------------------------------------------

test("a request body over the 2mb express.json() limit is rejected, not silently truncated", async () => {
  const oversized = JSON.stringify({ report: { padding: "x".repeat(3 * 1024 * 1024) } });

  const res = await fetch(`${baseUrl}/api/gate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: oversized,
  });

  assert.equal(res.status, 413);
});

// -- error handler fallback message --------------------------------------

test("GET /api/health still works after a previous request's error, proving one bad request doesn't wedge the server", async () => {
  await fetch(`${baseUrl}/api/gate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{broken",
  });

  const res = await fetch(`${baseUrl}/api/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.status, "ok");
});
