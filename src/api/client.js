// Thin REST client for the Django/DRF backend (Phase 7).
// Base URL resolution order:
//   1. window.__MKBS_API_BASE__ (runtime override, e.g. injected in index.html)
//   2. VITE_API_BASE env var (build-time)
//   3. "/api" (works with the Vite dev-server proxy -> http://localhost:8000)

const runtimeBase =
  typeof window !== "undefined" ? window.__MKBS_API_BASE__ : undefined;
export const API_BASE = (
  runtimeBase ||
  import.meta.env.VITE_API_BASE ||
  "/api"
).replace(/\/$/, "");

const TOKEN_KEY = "mkbs_api_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, detail, payload) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
    this.payload = payload;
  }
}

async function request(method, path, body, opts = {}) {
  const headers = { Accept: "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Token ${token}`;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const raw =
      (data && (data.detail || data.non_field_errors || data.error)) ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, Array.isArray(raw) ? raw[0] : raw, data);
  }
  return data;
}

export const api = {
  get: (p, opts) => request("GET", p, undefined, opts),
  post: (p, b, opts) => request("POST", p, b ?? {}, opts),
  patch: (p, b, opts) => request("PATCH", p, b ?? {}, opts),
  put: (p, b, opts) => request("PUT", p, b ?? {}, opts),
  del: (p, opts) => request("DELETE", p, undefined, opts),
};

// DRF paginated responses ({count, results}) are unwrapped to plain arrays.
export function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}
