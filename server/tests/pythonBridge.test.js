/**
 * pythonBridge.js spawns a real `python3` subprocess -- the hardest
 * thing in this codebase to test, since we can't (and shouldn't) rely
 * on a working Python + Fairlearn install being present wherever these
 * tests run, and mocking `child_process.spawn` itself would mean not
 * actually exercising the real spawn/stdout/stderr/close wiring at all.
 *
 * Instead these tests point PYTHON_BIN (the one seam pythonBridge.js
 * already exposes via an env var) at ordinary system binaries that are
 * guaranteed to exist and behave predictably, and let the REAL
 * runAudit() function run against them. That means these tests
 * genuinely exercise all three of runAudit's error-handling branches --
 * the actual logic this file adds on top of Node's child_process --
 * without needing Python installed at all:
 *
 *   - spawn ENOENT (bad PYTHON_BIN path)      -> "Could not start..."
 *   - non-zero exit code (a real binary that exits non-zero on args
 *     it doesn't understand)                  -> "fairaudit exited..."
 *   - exit 0 but non-JSON stdout (`echo` just echoes its argv back)
 *                                              -> "Could not parse..."
 *
 * We deliberately do NOT test the "exit 0 with valid JSON" path here --
 * that would require a real fake `fairaudit` binary, and the only thing
 * left to verify at that point is that `JSON.parse` parses JSON, which
 * is Node's job, not ours. Tests should focus on the branches *we*
 * wrote, not on the standard library underneath them.
 *
 * PYTHON_BIN is read once, at module load time (a top-level `const`),
 * so each test below re-imports pythonBridge.js with a cache-busting
 * query string after setting the env var -- otherwise every test after
 * the first would silently reuse whichever PYTHON_BIN was set when the
 * module was first evaluated.
 */

import assert from "node:assert/strict";
import os from "node:os";
import { test } from "node:test";

let importCounter = 0;
async function freshPythonBridge() {
  importCounter += 1;
  return import(`../src/pythonBridge.js?fresh=${importCounter}`);
}

// spawn() fails immediately with ENOENT if `cwd` itself doesn't exist,
// before it even tries to exec PYTHON_BIN -- so tests that want to
// reach PYTHON_BIN's own behavior (not just the "bad cwd" branch) need
// ENGINE_DIR pointed at a directory that's guaranteed to exist,
// independent of this repo's layout.
const A_REAL_DIRECTORY = os.tmpdir();

test("BridgeError is a real Error subclass named BridgeError", async () => {
  const { BridgeError } = await freshPythonBridge();
  const err = new BridgeError("something went wrong");

  assert.ok(err instanceof Error);
  assert.ok(err instanceof BridgeError);
  assert.equal(err.name, "BridgeError");
  assert.equal(err.message, "something went wrong");
});

test("runAudit rejects with a BridgeError when PYTHON_BIN doesn't exist on disk", async () => {
  process.env.PYTHON_BIN = "/definitely/not/a/real/binary-xyz123";
  const { runAudit, BridgeError } = await freshPythonBridge();

  await assert.rejects(
    () => runAudit("hiring"),
    (err) => {
      assert.ok(err instanceof BridgeError);
      assert.match(err.message, /Could not start the Python engine/);
      return true;
    }
  );

  delete process.env.PYTHON_BIN;
});

test("runAudit rejects with a BridgeError mentioning the exit code when the process exits non-zero", async () => {
  // Node itself doesn't understand runAudit's fixed `-m fairaudit.cli ...`
  // argv (that flag is Python's), so pointing PYTHON_BIN at the node
  // binary is a reliable, dependency-free way to trigger a real
  // non-zero exit with real stderr output.
  process.env.PYTHON_BIN = process.execPath;
  process.env.ENGINE_DIR = A_REAL_DIRECTORY;
  const { runAudit, BridgeError } = await freshPythonBridge();

  await assert.rejects(
    () => runAudit("hiring"),
    (err) => {
      assert.ok(err instanceof BridgeError);
      assert.match(err.message, /fairaudit exited with code/);
      return true;
    }
  );

  delete process.env.PYTHON_BIN;
  delete process.env.ENGINE_DIR;
});

test("runAudit rejects with a BridgeError when stdout isn't valid JSON", async () => {
  // `echo` exits 0 and writes its argv straight back to stdout -- never
  // valid JSON, so this deterministically exercises the JSON.parse
  // failure branch without needing any custom fixture binary.
  process.env.PYTHON_BIN = "/bin/echo";
  process.env.ENGINE_DIR = A_REAL_DIRECTORY;
  const { runAudit, BridgeError } = await freshPythonBridge();

  await assert.rejects(
    () => runAudit("hiring"),
    (err) => {
      assert.ok(err instanceof BridgeError);
      assert.match(err.message, /Could not parse fairaudit output as JSON/);
      return true;
    }
  );

  delete process.env.PYTHON_BIN;
  delete process.env.ENGINE_DIR;
});

test("runAudit's rejection is always a BridgeError, never a raw child_process error leaking through", async () => {
  process.env.PYTHON_BIN = "/another/fake/path-abc789";
  const { runAudit } = await freshPythonBridge();

  try {
    await runAudit("lending");
    assert.fail("expected runAudit to reject");
  } catch (err) {
    assert.equal(err.constructor.name, "BridgeError");
  } finally {
    delete process.env.PYTHON_BIN;
  }
});
