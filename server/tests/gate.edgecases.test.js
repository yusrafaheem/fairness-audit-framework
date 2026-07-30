/**
 * A second pass at evaluateGate, deliberately hunting for the kind of
 * gotchas that only show up when you stop feeding a function
 * well-formed input and start feeding it *adversarial* or merely
 * *weird* input: duplicate keys, type coercion, and JavaScript's more
 * infamous object-literal footguns. None of these represent bugs that
 * need fixing (each test documents and locks in the current, correct
 * behavior) -- they're the kind of "what if" cases a thorough test
 * suite should still write down, so the behavior is a documented
 * decision instead of an accident nobody would notice changing.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateGate } from "../src/lib/gate.js";

function metric(name, severity_score) {
  return { metric_name: name, severity_score };
}

test("duplicate metric_name entries are each evaluated independently (not deduplicated)", () => {
  const report = { metrics: [metric("demographic_parity", 80), metric("demographic_parity", 10)] };
  const result = evaluateGate(report);

  // blockingMetrics is built with .filter().map(), so a metric name
  // that appears twice in the input can appear twice in the output if
  // both entries individually cross the threshold -- there's no set
  // dedup anywhere in evaluateGate. Documenting that here so it's a
  // known, deliberate behavior rather than something to be "surprised"
  // by later if report generation ever produces duplicate metrics.
  assert.deepEqual(result.blockingMetrics, ["demographic_parity"]);
  assert.equal(result.passed, false);
});

test("a metric_name repeated with two different scores: thresholdsUsed reflects only the last one seen", () => {
  const report = { metrics: [metric("demographic_parity", 5), metric("demographic_parity", 5)] };
  // Only one override is given, but it applies to both entries since
  // thresholdsUsed is keyed by name, not by array index.
  const result = evaluateGate(report, { demographic_parity: 3 });
  assert.deepEqual(result.thresholdsUsed, { demographic_parity: 3 });
  assert.deepEqual(result.blockingMetrics, ["demographic_parity", "demographic_parity"]);
});

test("a string severity_score that looks numeric is coerced by >= and can still block (a real gotcha)", () => {
  // "80" >= 70 is `true` in JavaScript (the string is coerced to a
  // number for the comparison) -- so a report whose severity_score
  // somehow arrived as a string still gates correctly by accident, not
  // by design. Documented so nobody "fixes" evaluateGate assuming
  // strings are silently rejected; they're silently coerced instead.
  const report = { metrics: [metric("demographic_parity", "80")] };
  const result = evaluateGate(report);
  assert.equal(result.passed, false);
});

test("a non-numeric-looking string severity_score never blocks, because the coercion produces NaN and NaN >= anything is false", () => {
  const report = { metrics: [metric("demographic_parity", "not-a-number")] };
  const result = evaluateGate(report);
  assert.equal(result.passed, true);
  assert.deepEqual(result.blockingMetrics, []);
});

test("severity scores well outside the normal 0-100 range still compare correctly", () => {
  const report = {
    metrics: [metric("way_over", 1000), metric("negative", -50)],
  };
  const result = evaluateGate(report);
  assert.deepEqual(result.blockingMetrics, ["way_over"]);
});

test("a metric_name of \"__proto__\" does not pollute thresholdsUsed's prototype", () => {
  // thresholdsUsed starts life as a plain `{}`, and the loop does
  // `thresholdsUsed[m.metric_name] = ...`. If metric_name were
  // "__proto__", that's not an ordinary property assignment -- it hits
  // the special __proto__ accessor. The value being assigned here is
  // always a number (a threshold), and assigning a non-object to
  // __proto__ is a documented no-op in JS, so this should be safe --
  // but "should be safe" is exactly the kind of claim worth pinning
  // down with a test instead of trusting from memory.
  const report = { metrics: [metric("__proto__", 99)] };
  const result = evaluateGate(report);

  assert.equal(Object.getPrototypeOf(result.thresholdsUsed), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(result.thresholdsUsed, "__proto__"), false);
  // The global Object.prototype itself must be untouched -- if this
  // ever failed, it would mean EVERY object in the process just
  // silently gained a rogue property, which is the actual danger
  // prototype pollution bugs pose.
  assert.equal({}.someRandomProbe, undefined);
});
