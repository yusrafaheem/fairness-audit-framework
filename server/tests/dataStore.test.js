/**
 * dataStore.js touches the real filesystem, and the files it touches
 * are the same demo JSON checked into server/data/ that GET /api/audits
 * serves in production. Tests must not actually overwrite those files
 * (a test run corrupting the committed demo data would be a genuinely
 * bad outcome, not just an inconvenience), so every test in this file
 * mocks `node:fs/promises`'s readFile/writeFile via node:test's
 * `t.mock.method` instead of touching disk.
 *
 * This works because dataStore.js does `import fs from "node:fs/promises"`
 * and calls `fs.readFile(...)` / `fs.writeFile(...)` as *property
 * accesses* on that shared module object at call time -- mocking a
 * method on the object (rather than trying to rebind the named import,
 * which real ES module bindings don't allow from outside the module)
 * is enough to intercept every call dataStore.js makes, and
 * `t.mock.method` automatically restores the original implementation
 * after each test.
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import { getAuditReport, listAudits, saveAuditReport } from "../src/lib/dataStore.js";

function enoent() {
  const err = new Error("ENOENT: no such file or directory");
  err.code = "ENOENT";
  return err;
}

// -- listAudits ---------------------------------------------------------

test("listAudits reads index.json and returns it parsed", async (t) => {
  const fakeIndex = { generated_by: "test", domains: [{ domain: "hiring", gate_pass: true }] };
  const readFileMock = t.mock.method(fs, "readFile", async () => JSON.stringify(fakeIndex));

  const result = await listAudits();

  assert.deepEqual(result, fakeIndex);
  assert.equal(readFileMock.mock.callCount(), 1);
  const [calledPath] = readFileMock.mock.calls[0].arguments;
  assert.ok(calledPath.endsWith("index.json"), `expected a path ending in index.json, got ${calledPath}`);
});

// -- getAuditReport -------------------------------------------------------

test("getAuditReport returns the parsed report when the file exists", async (t) => {
  const fakeReport = { domain: "hiring", metrics: [] };
  t.mock.method(fs, "readFile", async () => JSON.stringify(fakeReport));

  const result = await getAuditReport("hiring");

  assert.deepEqual(result, fakeReport);
});

test("getAuditReport returns null (not throw) when the report file doesn't exist", async (t) => {
  t.mock.method(fs, "readFile", async () => {
    throw enoent();
  });

  const result = await getAuditReport("nonexistent-domain");

  assert.equal(result, null);
});

test("getAuditReport re-throws non-ENOENT errors instead of swallowing them", async (t) => {
  t.mock.method(fs, "readFile", async () => {
    const err = new Error("permission denied");
    err.code = "EACCES";
    throw err;
  });

  await assert.rejects(() => getAuditReport("hiring"), /permission denied/);
});

test("getAuditReport reads a path built from the given domain", async (t) => {
  const readFileMock = t.mock.method(fs, "readFile", async () => "{}");

  await getAuditReport("lending");

  const [calledPath] = readFileMock.mock.calls[0].arguments;
  assert.ok(calledPath.endsWith("lending.json"), `expected a path ending in lending.json, got ${calledPath}`);
});

// -- saveAuditReport / refreshIndexEntry -----------------------------------

test("saveAuditReport writes the report as pretty-printed JSON to <domain>.json", async (t) => {
  const writeFileMock = t.mock.method(fs, "writeFile", async () => {});
  t.mock.method(fs, "readFile", async () => JSON.stringify({ generated_by: "server", domains: [] }));

  const report = { domain: "hiring", overall_severity_score: 12.3, metrics: [] };
  await saveAuditReport("hiring", report);

  const reportWriteCall = writeFileMock.mock.calls.find((call) => call.arguments[0].endsWith("hiring.json"));
  assert.ok(reportWriteCall, "expected a writeFile call targeting hiring.json");
  const [, writtenContent] = reportWriteCall.arguments;
  assert.equal(writtenContent, JSON.stringify(report, null, 2));
});

test("saveAuditReport appends a new index entry when the domain isn't already in index.json", async (t) => {
  const existingIndex = { generated_by: "server", domains: [{ domain: "lending", gate_pass: true }] };
  t.mock.method(fs, "readFile", async () => JSON.stringify(existingIndex));
  const writeFileMock = t.mock.method(fs, "writeFile", async () => {});

  await saveAuditReport("hiring", {
    overall_severity_score: 60.8,
    overall_severity_tier: "moderate",
    gate_pass: true,
    n_test_samples: 1200,
    generated_at: "2026-07-11T00:00:00Z",
  });

  const indexWriteCall = writeFileMock.mock.calls.find((call) => call.arguments[0].endsWith("index.json"));
  const writtenIndex = JSON.parse(indexWriteCall.arguments[1]);
  assert.equal(writtenIndex.domains.length, 2);
  assert.ok(writtenIndex.domains.some((d) => d.domain === "lending"));
  assert.ok(writtenIndex.domains.some((d) => d.domain === "hiring"));
});

test("saveAuditReport REPLACES the existing index entry for a domain rather than duplicating it", async (t) => {
  const existingIndex = {
    generated_by: "server",
    domains: [{ domain: "hiring", gate_pass: false, overall_severity_score: 90 }],
  };
  t.mock.method(fs, "readFile", async () => JSON.stringify(existingIndex));
  const writeFileMock = t.mock.method(fs, "writeFile", async () => {});

  await saveAuditReport("hiring", {
    overall_severity_score: 60.8,
    overall_severity_tier: "moderate",
    gate_pass: true,
    n_test_samples: 1200,
    generated_at: "2026-07-11T00:00:00Z",
  });

  const indexWriteCall = writeFileMock.mock.calls.find((call) => call.arguments[0].endsWith("index.json"));
  const writtenIndex = JSON.parse(indexWriteCall.arguments[1]);
  assert.equal(writtenIndex.domains.length, 1);
  assert.equal(writtenIndex.domains[0].gate_pass, true);
  assert.equal(writtenIndex.domains[0].overall_severity_score, 60.8);
});

test("saveAuditReport falls back to a fresh index when index.json can't be read (e.g. first run ever)", async (t) => {
  t.mock.method(fs, "readFile", async () => {
    throw enoent();
  });
  const writeFileMock = t.mock.method(fs, "writeFile", async () => {});

  await saveAuditReport("hiring", {
    overall_severity_score: 60.8,
    overall_severity_tier: "moderate",
    gate_pass: true,
    n_test_samples: 1200,
    generated_at: "2026-07-11T00:00:00Z",
  });

  const indexWriteCall = writeFileMock.mock.calls.find((call) => call.arguments[0].endsWith("index.json"));
  const writtenIndex = JSON.parse(indexWriteCall.arguments[1]);
  assert.equal(writtenIndex.domains.length, 1);
  assert.equal(writtenIndex.domains[0].domain, "hiring");
});

test("saveAuditReport returns the report it was given", async (t) => {
  t.mock.method(fs, "readFile", async () => JSON.stringify({ generated_by: "server", domains: [] }));
  t.mock.method(fs, "writeFile", async () => {});

  const report = { domain: "hiring", metrics: [] };
  const result = await saveAuditReport("hiring", report);

  assert.deepEqual(result, report);
});
