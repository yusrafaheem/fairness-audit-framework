/**
 * Thin fetch wrapper around the fairaudit REST API. In dev, Vite proxies
 * `/api/*` to the Express server (see vite.config.js); in a static
 * production build, set VITE_API_BASE_URL to the deployed server's URL.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request to ${path} failed with status ${res.status}`);
  }
  return body;
}

export function fetchAuditIndex() {
  return request("/api/audits");
}

export function fetchAuditReport(domain) {
  return request(`/api/audits/${domain}`);
}

export function runLiveAudit(domain) {
  return request(`/api/audits/${domain}/run`, { method: "POST" });
}

export function evaluateGate(domain, thresholds = {}) {
  return request("/api/gate", {
    method: "POST",
    body: JSON.stringify({ domain, thresholds }),
  });
}
