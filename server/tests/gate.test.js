/**
 * evaluateGate is the richest test target in this codebase: a small,
 * pure, dependency-free function with real decision logic (an inclusive
 * `>=` threshold comparison, per-metric overrides via `??`, optional
 * field defaulting via `??`). No mocking is needed anywhere in this
 * file -- that's the point of testing pure functions first: they're
 * cheap to test exhaustively, and every bug caught here is a bug that
 * would otherwise only show up once real report data flows through
 * POST /api/gate.
 *
 * Two of the tests near the bottom (`hiring.json`, `content_moderation.json`)
 * are regression tests against the *actual* committed demo data in
 * server/data/ -- they assert evaluateGate reproduces the `gate_pass`
 * field that's already baked into those files, which is a cheap way to
 * catch this JS port silently drifting from engine/fairaudit/gate.py's
 * behavior over time.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DEFAULT_BLOCKING_SCORE, evaluateGate } from "../src/lib/gate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

function metric(name, severity_score, overrides = {}) {
  return { metric_name: name, severity_score, ...overrides };
}

// -- input validation ------------------------------------------------

test("evaluateGate throws when report is null", () => {
  assert.throws(() => evaluateGate(null), /metrics.*array/);
});

test("evaluateGate throws when report is undefined", () => {
  assert.throws(() => evaluateGate(undefined), /metrics.*array/);
});

test("evaluateGate throws when report.metrics is missing entirely", () => {
  assert.throws(() => evaluateGate({ domain: "hiring" }), /metrics.*array/);
});

test("evaluateGate throws when report.metrics is not an array (e.g. an object)", () => {
  assert.throws(() => evaluateGate({ metrics: { demographic_parity: 80 } }), /metrics.*array/);
});

// -- boundary behavior on the default threshold -----------------------

test("a metric scoring exactly at DEFAULT_BLOCKING_SCORE is blocking (inclusive >=)", () => {
  const report = { metrics: [metric("demographic_parity", DEFAULT_BLOCKING_SCORE)] };
  const result = evaluateGate(report);
  assert.equal(result.passed, false);
  assert.deepEqual(result.blockingMetrics, ["demographic_parity"]);
});

test("a metric scoring just under DEFAULT_BLOCKING_SCORE passes", () => {
  const report = { metrics: [metric("demographic_parity", DEFAULT_BLOCKING_SCORE - 0.01)] };
  const result = evaluateGate(report);
  assert.equal(result.passed, true);
  assert.deepEqual(result.blockingMetrics, []);
});

test("an empty metrics array always passes with no blocking metrics", () => {
  const result = evaluateGate({ metrics: [] });
  assert.equal(result.passed, true);
  assert.deepEqual(result.blockingMetrics, []);
});

// -- mixed pass/fail across multiple metrics ---------------------------

test("blockingMetrics lists only the metrics at or above threshold, not all of them", () => {
  const report = {
    metrics: [
      metric("demographic_parity", 40),
      metric("equalized_odds", 71),
      metric("predictive_parity", 69.9),
    ],
  };
  const result = evaluateGate(report);
  assert.equal(result.passed, false);
  assert.deepEqual(result.blockingMetrics, ["equalized_odds"]);
});

test("passed is false as soon as ANY metric blocks, even if most pass", () => {
  const report = {
    metrics: [metric("a", 10), metric("b", 10), metric("c", 10), metric("d", 99)],
  };
  const result = evaluateGate(report);
  assert.equal(result.passed, false);
  assert.deepEqual(result.blockingMetrics, ["d"]);
});

// -- per-metric threshold overrides -------------------------------------

test("a threshold override lowers the bar for just that one metric", () => {
  const report = {
    metrics: [metric("demographic_parity", 40), metric("equalized_odds", 25.1)],
  };
  // Without an override, 25.1 easily passes (default bar is 70). Lower
  // the bar for equalized_odds specifically to make it block.
  const result = evaluateGate(report, { equalized_odds: 20 });
  assert.equal(result.passed, false);
  assert.deepEqual(result.blockingMetrics, ["equalized_odds"]);
});

test("thresholds for metrics not present in the report are simply unused", () => {
  const report = { metrics: [metric("demographic_parity", 10)] };
  const result = evaluateGate(report, { some_other_metric: 5 });
  assert.equal(result.passed, true);
  assert.deepEqual(result.thresholdsUsed, { demographic_parity: DEFAULT_BLOCKING_SCORE });
});

test("thresholdsUsed reflects a merge of overrides and the default for every metric in the report", () => {
  const report = {
    metrics: [metric("demographic_parity", 10), metric("equalized_odds", 10), metric("predictive_parity", 10)],
  };
  const result = evaluateGate(report, { equalized_odds: 42 });
  assert.deepEqual(result.thresholdsUsed, {
    demographic_parity: DEFAULT_BLOCKING_SCORE,
    equalized_odds: 42,
    predictive_parity: DEFAULT_BLOCKING_SCORE,
  });
});

test("an explicit threshold of 0 for a metric is honored, not treated as missing", () => {
  // Regression guard for a `thresholds[name] || DEFAULT` implementation
  // instead of `??` -- 0 is falsy, so `||` would incorrectly fall back
  // to the default here. The real implementation uses `??`, which only
  // falls back on null/undefined, so an explicit 0 threshold means
  // "block on any severity score at all."
  const report = { metrics: [metric("demographic_parity", 1)] };
  const result = evaluateGate(report, { demographic_parity: 0 });
  assert.equal(result.passed, false);
  assert.deepEqual(result.thresholdsUsed, { demographic_parity: 0 });
});

// -- passthrough / defaulting of optional report-level fields -----------

test("overallSeverityScore and overallSeverityTier are copied through from the report", () => {
  const report = {
    metrics: [],
    overall_severity_score: 55.5,
    overall_severity_tier: "moderate",
  };
  const result = evaluateGate(report);
  assert.equal(result.overallSeverityScore, 55.5);
  assert.equal(result.overallSeverityTier, "moderate");
});

test("overallSeverityScore, overallSeverityTier, and domain default to null when absent", () => {
  const result = evaluateGate({ metrics: [] });
  assert.equal(result.overallSeverityScore, null);
  assert.equal(result.overallSeverityTier, null);
  assert.equal(result.domain, null);
});

// -- regression tests against real committed demo data -------------------

test("evaluateGate reproduces the committed gate_pass for hiring.json", async () => {
  const raw = await readFile(path.join(DATA_DIR, "hiring.json"), "utf-8");
  const report = JSON.parse(raw);

  const result = evaluateGate(report);

  assert.equal(result.passed, report.gate_pass);
  assert.deepEqual(result.blockingMetrics, []);
});

test("evaluateGate reproduces the committed gate_pass for content_moderation.json, and names the two metrics that block", async () => {
  const raw = await readFile(path.join(DATA_DIR, "content_moderation.json"), "utf-8");
  const report = JSON.parse(raw);

  const result = evaluateGate(report);

  assert.equal(result.passed, report.gate_pass);
  assert.equal(result.passed, false);
  // demographic_parity (72.0) and equalized_odds (70.1) are both >= 70;
  // predictive_parity (65.9) is not.
  assert.deepEqual(new Set(result.blockingMetrics), new Set(["demographic_parity", "equalized_odds"]));
  assert.ok(!result.blockingMetrics.includes("predictive_parity"));
});
