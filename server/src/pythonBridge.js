/**
 * Bridges the Node REST API to the Python `fairaudit` CLI for *live*
 * audit runs (`POST /api/audits/:domain/run`). Read-only report
 * fetching (`GET /api/audits/:domain`) does not go through here — it
 * just serves the committed JSON in `data/`, so the dashboard has
 * something to show even on a machine without Python/scikit-learn/
 * Fairlearn installed.
 *
 * This is also, deliberately, the whole point of the architecture: the
 * fairness math lives in exactly one place (the Python package), and
 * both the CLI and the REST API call the same code path, so they can
 * never drift out of sync with each other.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const ENGINE_DIR = path.resolve(__dirname, "../../", process.env.ENGINE_DIR || "../engine");

/**
 * Runs `fairaudit audit --domain <domain>` as a subprocess and parses
 * its stdout as JSON.
 *
 * @param {string} domain
 * @returns {Promise<object>} the parsed AuditReport
 */
export function runAudit(domain) {
  return new Promise((resolve, reject) => {
    const args = ["-m", "fairaudit.cli", "audit", "--domain", domain];
    const child = spawn(PYTHON_BIN, args, { cwd: ENGINE_DIR });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(
        new BridgeError(
          `Could not start the Python engine ("${PYTHON_BIN} ${args.join(" ")}"). ` +
            `Is Python installed and on PATH? Original error: ${err.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new BridgeError(
            `fairaudit exited with code ${code}. Have you run ` +
              `"pip install -r engine/requirements.txt"? stderr: ${stderr.trim()}`
          )
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseErr) {
        reject(new BridgeError(`Could not parse fairaudit output as JSON: ${parseErr.message}`));
      }
    });
  });
}

export class BridgeError extends Error {
  constructor(message) {
    super(message);
    this.name = "BridgeError";
  }
}
