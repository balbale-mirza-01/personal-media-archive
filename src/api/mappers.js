// Field mappers between the DRF API payloads and the field names used by the
// prototype's UI components / localStorage store. The StoreProvider adapter
// (src/lib/StoreContext.jsx) converts on every boundary so pages need no
// changes beyond reading `db.media`, `db.genres`, etc. exactly as before.

import { emptyMediaDefaults } from "@/lib/store";

// ---------- MediaItem ----------

export function mediaFromApi(item) {
  if (!item) return item;
  const credits = item.credits || [];
  const toCredit = (c) => ({
    person_id: String(c.person_id ?? c.person),
    role_type: c.role,
    role: c.role === "actor" ? c.character_name || "Actor" : cap(c.role),
    character_name: c.character_name || "",
    order: c.order ?? 0,
  });
  return {
    ...emptyMediaDefaults(),
    id: String(item.id),
    imdb_id: item.imdb_id || "",
    type: item.media_type || "movie",
    title_english: item.title_en || "",
    title_original: item.title_original || "",
    release_year: item.year ?? null,
    end_year: item.end_year ?? null,
    mpa_rating: item.mpa_rating || "",
    runtime: item.runtime_minutes ?? null,
    aspect_ratio: item.aspect_ratio || "",
    languages: item.languages || [],
    countries: item.countries || [],
    plot_summary: item.synopsis || "",
    poster_url: item.poster_url || "",
    genre_ids: (item.genres || []).map((g) => String(g.id)),
    genres: item.genres || [],
    tag_ids: (item.tags || []).map((t) => String(t.id)),
    tags: item.tags || [],
    imdb_rating: item.imdb_rating ?? null,
    imdb_votes: item.imdb_votes ?? null,
    personal_rating: item.personal_rating ?? 0,
    watch_status: item.watch_status || "unwatched",
    watchlist_context: item.watchlist_context || "none",
    watchlist_added_at: item.watchlist_added_at || null,
    parents_guide_notes: item.parents_guide || {},
    parental_notes: item.parental_notes || "",
    notes: item.notes || "",
    cast: credits.filter((c) => c.role === "actor").map(toCredit),
    crew: credits
      .filter((c) => c.role !== "actor")
      .map(toCredit)
      .sort((a, b) => a.order - b.order),
    files: (item.media_files || item.files || []).map(fileFromApi),
    seasons: (item.seasons || []).map(seasonFromApi),
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

export function mediaToApi(m) {
  if (!m) return m;
  const credits = [
    ...(m.crew || []).map((c, i) => ({
      person: Number(c.person_id),
      role: c.role_type || (c.role === "Director" ? "director" : "creator"),
      character_name: "",
      order: i,
    })),
    ...(m.cast || []).map((c, i) => ({
      person: Number(c.person_id),
      role: "actor",
      character_name: c.role || c.character_name || "",
      order: i,
    })),
  ].filter((c) => Number.isFinite(c.person));
  return {
    ...mediaCoreToApi(m),
    credit_payloads: credits,
    season_payloads: (m.seasons || []).map(seasonToPayload),
    file_payloads: (m.files || []).map(fileToPayload),
  };
}

// Core scalar fields only — used for PATCH-style partial updates where the
// caller provides a patch object rather than a full entity.
export function mediaCoreToApi(m) {
  return {
    imdb_id: m.imdb_id || "",
    media_type: m.type || "movie",
    title_en: m.title_english || "",
    title_original: m.title_original || "",
    year: m.release_year ?? null,
    end_year: m.end_year ?? null,
    mpa_rating: m.mpa_rating || "",
    runtime_minutes: m.runtime ?? null,
    aspect_ratio: m.aspect_ratio || "",
    languages: m.languages || [],
    countries: m.countries || [],
    synopsis: m.plot_summary || "",
    poster_url: m.poster_url || "",
    genre_ids: (m.genre_ids || []).map(Number).filter(Number.isFinite),
    tag_ids: (m.tag_ids || []).map(Number).filter(Number.isFinite),
    imdb_rating: m.imdb_rating ?? null,
    imdb_votes: m.imdb_votes ?? null,
    personal_rating: m.personal_rating || null,
    watch_status: m.watch_status || "unwatched",
    watchlist_context: m.watchlist_context || "none",
    parents_guide: m.parents_guide_notes || {},
    parental_notes: m.parental_notes || "",
    notes: m.notes || "",
  };
}

// ---------- Seasons / Episodes ----------

function seasonFromApi(s) {
  return {
    id: String(s.id),
    season_number: s.season_number,
    imdb_id: s.imdb_id || "",
    title: s.title || "",
    year: s.year ?? null,
    overview: s.overview || "",
    poster_url: s.poster_url || "",
    avg_imdb_rating: s.avg_imdb_rating ?? null,
    watched_count: s.watched_count ?? 0,
    episode_count: s.episode_count ?? 0,
    episodes: (s.episodes || []).map((e) => ({
      id: String(e.id),
      episode_number: e.episode_number,
      imdb_id: e.imdb_id || "",
      title: e.title || "",
      air_date: e.air_date || null,
      runtime: e.runtime_minutes ?? null,
      overview: e.overview || "",
      still_url: e.still_url || "",
      imdb_rating: e.imdb_rating ?? null,
      imdb_votes: e.imdb_votes ?? null,
      personal_rating: e.personal_rating ?? null,
      watch_status: e.watch_status || "unwatched",
    })),
  };
}

function seasonToPayload(s) {
  return {
    season_number: s.season_number,
    imdb_id: s.imdb_id || "",
    title: s.title || "",
    year: s.year ?? null,
    overview: s.overview || "",
    poster_url: s.poster_url || "",
    episodes: (s.episodes || []).map((e) => ({
      episode_number: e.episode_number,
      imdb_id: e.imdb_id || "",
      title: e.title || "",
      air_date: e.air_date || null,
      runtime_minutes: e.runtime ?? null,
      overview: e.overview || "",
      still_url: e.still_url || "",
      imdb_rating: e.imdb_rating ?? null,
      imdb_votes: e.imdb_votes ?? null,
      personal_rating: e.personal_rating ?? null,
      watch_status: e.watch_status || "unwatched",
    })),
  };
}

// ---------- MediaFile ----------

function fileFromApi(f) {
  return {
    id: String(f.id),
    file_path: f.file_path || "",
    file_name: f.file_name || "",
    file_size: f.file_size_bytes ?? null,
    quality: f.quality || "",
    source: f.source || "",
    codec: f.codec || "",
    version_tag: f.version_tag || "",
    is_multi_part: !!f.is_multi_part,
    part_number: f.part_number ?? 1,
    hard_drive_id: f.hard_drive_id != null ? String(f.hard_drive_id) : null,
    episode_id: f.episode != null ? String(f.episode) : null,
  };
}

function fileToPayload(f) {
  return {
    file_path: f.file_path || "",
    file_name: f.file_name || "",
    file_size_bytes: f.file_size ?? null,
    quality: f.quality || "",
    source: f.source || "",
    codec: f.codec || "",
    version_tag: f.version_tag || "",
    is_multi_part: !!f.is_multi_part,
    part_number: f.part_number ?? 1,
    hard_drive_id: f.hard_drive_id != null ? Number(f.hard_drive_id) : null,
    episode: f.episode_id != null ? Number(f.episode_id) : null,
  };
}

// ---------- Genre / Tag / Person / HardDrive ----------

export function genreFromApi(g) {
  if (!g) return g;
  const pg = g.parent_genre ?? g.parent_genre_id;
  return {
    ...g,
    id: String(g.id),
    name_fa: g.name_fa || "",
    description: g.description || "",
    parent_genre_id: pg != null ? String(pg) : null,
  };
}
export function genreToApi(g) {
  return {
    imdb_genre_id: g.imdb_genre_id || "",
    name: g.name || "",
    genre_type: g.genre_type || "main",
    parent_genre_id: g.parent_genre_id ? Number(g.parent_genre_id) : null,
  };
}

export function tagFromApi(t) {
  if (!t) return t;
  return { ...t, id: String(t.id) };
}
export const tagToApi = (t) => ({ name: t.name || "", color: t.color || "" });

export function personFromApi(p) {
  if (!p) return p;
  return { ...p, id: String(p.id) };
}
export function personToApi(p) {
  return {
    imdb_person_id: p.imdb_person_id || "",
    name: p.name || "",
    original_name: p.original_name || "",
    roles: p.roles || [],
    bio: p.bio || "",
    profile_image_url: p.profile_image_url || "",
  };
}

export function driveFromApi(h) {
  if (!h) return h;
  return { ...h, id: String(h.id) };
}
export function driveToApi(h) {
  return {
    label: h.label || "",
    name: h.name || "",
    mount_path: h.mount_path || "",
    is_connected: !!h.is_connected,
    total_size_gb: h.total_size_gb ?? null,
    free_size_gb: h.free_size_gb ?? null,
  };
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
