// REST endpoint wrappers for the Django/DRF backend (Phase 7).
// All functions return API-shaped JSON; field mapping happens in mappers.js.

import { api, unwrapList, getToken, setToken } from "./client";

export { getToken, setToken };

// ---------- Auth ----------
export const authApi = {
  // Demo credentials accepted by the seeded backend users (admin / user).
  token: (username, password) =>
    api.post("/auth/token/", { username, password }),
};

// ---------- Collections ----------
const qs = (params) => {
  const p = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  return p.length ? `?${new URLSearchParams(p).toString()}` : "";
};

export const mediaApi = {
  list: async (params) =>
    unwrapList(await api.get(`/media-items/${qs(params)}`)),
  get: (id) => api.get(`/media-items/${id}/`),
  create: (payload) => api.post("/media-items/", payload),
  update: (id, payload) => api.put(`/media-items/${id}/`, payload),
  patch: (id, payload) => api.patch(`/media-items/${id}/`, payload),
  remove: (id) => api.del(`/media-items/${id}/`),
  bulkDelete: (ids) => api.post("/media-items/bulk-delete/", { ids }),
  bulkAddGenres: (ids, genre_ids) =>
    api.post("/media-items/bulk-add-genres/", { ids, genre_ids }),
  bulkAddTags: (ids, tag_ids) =>
    api.post("/media-items/bulk-add-tags/", { ids, tag_ids }),
  bulkMoveFiles: (ids, hard_drive_id) =>
    api.post("/media-items/bulk-move-files/", { ids, hard_drive_id }),
  toggleWatch: (id) => api.post(`/media-items/${id}/toggle-watch/`, {}),
  setWatchlist: (id, context) =>
    api.post(`/media-items/${id}/watchlist/`, { context }),
};

export const genreApi = {
  list: async () => unwrapList(await api.get("/genres/")),
  create: (p) => api.post("/genres/", p),
  update: (id, p) => api.patch(`/genres/${id}/`, p),
  remove: (id) => api.del(`/genres/${id}/`),
};

export const tagApi = {
  list: async () => unwrapList(await api.get("/tags/")),
  create: (p) => api.post("/tags/", p),
  update: (id, p) => api.patch(`/tags/${id}/`, p),
  remove: (id) => api.del(`/tags/${id}/`),
};

export const personApi = {
  list: async () => unwrapList(await api.get("/persons/")),
  get: (id) => api.get(`/persons/${id}/`),
  create: (p) => api.post("/persons/", p),
  update: (id, p) => api.patch(`/persons/${id}/`, p),
  remove: (id) => api.del(`/persons/${id}/`),
  filmography: async (id) =>
    unwrapList(await api.get(`/persons/${id}/filmography/`)),
};

export const driveApi = {
  list: async () => unwrapList(await api.get("/hard-drives/")),
  create: (p) => api.post("/hard-drives/", p),
  update: (id, p) => api.patch(`/hard-drives/${id}/`, p),
  remove: (id) => api.del(`/hard-drives/${id}/`),
};

export const episodeApi = {
  toggle: (id, status) =>
    api.post(`/episodes/${id}/toggle/`, status ? { watch_status: status } : {}),
};

// ---------- Bulk import / scan / IMDb / ingest (Phases 5-6 endpoints) ----------
export const bulkApi = {
  import: (rows, mode = "skip") =>
    api.post("/bulk-import/", {
      rows: rows.map((r) => ({ ...r, skip_duplicates: mode !== "create" })),
      mode,
    }),
};

export const scanApi = {
  scan: (path) => api.post("/scan/", { path }),
  imdbSearch: (q, year, type) =>
    api.get(`/imdb/search/${qs({ q, year, type })}`),
  imdbDetails: (imdb_id) => api.get(`/imdb/search/${qs({ imdb_id })}`),
  ingest: (selections) => api.post("/ingest/", { selections }),
};
