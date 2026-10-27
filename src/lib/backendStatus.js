// Lightweight backend health check used by the Login page and Layout banner.
// The store operates in "api" mode only when a DRF token exists AND the
// backend answers /api/health/. Otherwise it stays on the local (localStorage)
// demo store, which keeps the prototype usable without Django running.

import { API_BASE } from "@/api/client";

export async function pingBackend(timeoutMs = 2500) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${API_BASE}/health/`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
