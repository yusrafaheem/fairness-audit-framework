/**
 * HTTP-level proof that the isSafeDomain check actually stops a
 * traversal attempt at the route layer, not just in isolation
 * (validators.test.js tests the function directly; this file tests
 * that it's actually wired into the routes that matter).
 *
 * The interesting case is the %2F one: Express's route matching splits
 * the URL on literal "/" characters *before* decoding each segment, so
 * a request to `/api/audits/..%2F..%2Fetc%2Fpasswd` still matches the
 * single-segment `/:domain` pattern (the raw segment is
 * "..%2F..%2Fetc%2Fpasswd", no literal slash in it yet) -- and only
 * *after* matching does Express percent-decode it into
 * "../../etc/passwd" for req.params.domain. That decoded value is what
 * actually reaches dataStore.js, so it's what isSafeDomain has to
 * catch, and it's what these tests send.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";

/**
 * fetch(url) builds a WHATWG URL object internally, and that object's
 * parser removes bare "." / ".." path segments *client-side* before a
 * single byte goes over the wire (confirmed by hand: `new
 * URL("http://h/api/audits/..").pathname` is "/api/", not
 * "/api/audits/.."). That's great for browsers, but it means fetch()
 * genuinely cannot be used to send a literal ".." segment to test
 * against here -- there's nothing to catch server-side because the
 * request never arrives that way.
 *
 * node:http's low-level request() has no such normalization: its
 * `path` option is written into the request line close to verbatim.
 * That's the more realistic stand-in for "a client that isn't a
 * browser" (curl --path-as-is, a hand-rolled HTTP client, another
 * service) actually sending the raw bytes an attacker would send.
 */
function rawGet(baseUrl, rawPath) {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(baseUrl);
    const req = http.request({ hostname, port, path: rawPath, method: "GET" }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on("error", reject);
    req.end();
  });
}

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

test("GET /api/audits/:domain rejects an encoded traversal payload with 400, not 404 or 500", async () => {
  const res = await fetch(`${baseUrl}/api/audits/..%2F..%2Fetc%2Fpasswd`);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /Invalid domain/);
});

test("POST /api/audits/:domain/run rejects an encoded traversal payload with 400, and never reaches the Python bridge", async () => {
  const res = await fetch(`${baseUrl}/api/audits/..%2Fetc%2Fpasswd/run`, { method: "POST" });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /Invalid domain/);
  // If this had reached runAudit instead, the failure mode would be a
  // 502 BridgeError, not a 400 -- asserting the exact message rules
  // that out.
  assert.ok(!/Python engine/.test(body.error));
});

test("GET /api/audits/:domain rejects a literal, unencoded \"..\" domain sent by a non-browser client", async () => {
  // Deliberately uses the raw node:http client (see rawGet above) --
  // fetch() cannot produce this request at all, since its URL parser
  // strips ".." segments before the request is ever sent.
  const { status, body } = await rawGet(baseUrl, "/api/audits/..");

  assert.equal(status, 400);
  assert.match(body.error, /Invalid domain/);
});

test("POST /api/gate rejects a traversal-shaped domain field in the JSON body", async () => {
  const res = await fetch(`${baseUrl}/api/gate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ domain: "../../etc/passwd" }),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /Invalid domain/);
});

test("a legitimate domain still works normally through GET /api/audits/:domain after the validation was added", async () => {
  const res = await fetch(`${baseUrl}/api/audits/hiring`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.domain, "hiring");
});

test("a legitimate domain still works normally through POST /api/gate after the validation was added", async () => {
  const res = await fetch(`${baseUrl}/api/gate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ domain: "hiring" }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.passed, true);
});
