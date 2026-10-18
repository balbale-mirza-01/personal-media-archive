import { seedData } from "./seedData";

const DB_KEY = "mkbs_db_v1";

export function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore corrupt storage
  }
  return structuredClone(seedData);
}

export function saveDB(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    // storage may be full or unavailable
  }
}

export function resetDB() {
  localStorage.removeItem(DB_KEY);
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---- Filename parsing for the scan simulator ----
export function parseFilename(filename) {
  const clean = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const yearMatch = clean.match(/\b(19\d{2}|20\d{2})\b/);
  const seasonMatch =
    clean.match(/S(\d{1,2})E(\d{1,2})/i) ||
    clean.match(/Season[\s-]?(\d{1,2})\s*Episode\s*(\d{1,2})/i);
  const qualityMatch = clean.match(/\b(4K|2160p|1080p|720p|480p|UHD)\b/i);
  const sourceMatch = clean.match(
    /\b(BluRay|BRRip|WEB-DL|WEBRip|AMZN|NTb|playHD|HDTV|HDRip)\b/i,
  );

  let title = clean;
  let year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (yearMatch) title = clean.slice(0, clean.indexOf(yearMatch[1])).trim();
  if (seasonMatch) {
    const idx = clean.toUpperCase().indexOf("S" + seasonMatch[1]);
    if (idx > 0) title = clean.slice(0, idx).trim();
  }
  title = title
    .replace(
      /\b(4K|2160p|1080p|720p|480p|UHD|BluRay|BRRip|WEB-DL|WEBRip|AMZN|NTb|playHD|HDTV|HDRip|DDP?5?1?|x264|x265|HEVC|HDR|10bit|Atmos)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  return {
    raw: filename,
    title: title || clean,
    year,
    isSeries: !!seasonMatch,
    season: seasonMatch ? parseInt(seasonMatch[1], 10) : null,
    episode: seasonMatch ? parseInt(seasonMatch[2], 10) : null,
    quality: qualityMatch ? qualityMatch[1].toUpperCase() : null,
    source: sourceMatch ? sourceMatch[1] : null,
  };
}

// ---- Mock IMDb search ----
const mockImdbPool = [
  {
    imdb_id: "tt1375666",
    title: "Inception",
    year: 2010,
    type: "movie",
    rating: 8.8,
    genres: ["Action", "Sci-Fi", "Thriller"],
    mpa: "PG-13",
    runtime: 148,
  },
  {
    imdb_id: "tt0816692",
    title: "Interstellar",
    year: 2014,
    type: "movie",
    rating: 8.7,
    genres: ["Adventure", "Drama", "Sci-Fi"],
    mpa: "PG-13",
    runtime: 169,
  },
  {
    imdb_id: "tt1160419",
    title: "Dune: Part One",
    year: 2021,
    type: "movie",
    rating: 8.0,
    genres: ["Action", "Adventure", "Drama"],
    mpa: "PG-13",
    runtime: 155,
  },
  {
    imdb_id: "tt5788792",
    title: "One Battle After Another",
    year: 2025,
    type: "movie",
    rating: 7.4,
    genres: ["Action", "Crime", "Thriller"],
    mpa: "R",
    runtime: 141,
  },
  {
    imdb_id: "tt5788792",
    title: "The Marvelous Mrs. Maisel",
    year: 2017,
    type: "series",
    rating: 8.7,
    genres: ["Comedy", "Drama"],
    mpa: "TV-MA",
    runtime: 57,
  },
  {
    imdb_id: "tt0903747",
    title: "Breaking Bad",
    year: 2008,
    type: "series",
    rating: 9.5,
    genres: ["Crime", "Drama", "Thriller"],
    mpa: "TV-MA",
    runtime: 49,
  },
  {
    imdb_id: "tt0468569",
    title: "The Dark Knight",
    year: 2008,
    type: "movie",
    rating: 9.0,
    genres: ["Action", "Crime", "Drama"],
    mpa: "PG-13",
    runtime: 152,
  },
  {
    imdb_id: "tt15398776",
    title: "Oppenheimer",
    year: 2023,
    type: "movie",
    rating: 8.3,
    genres: ["Biography", "Drama", "History"],
    mpa: "R",
    runtime: 180,
  },
];

export function mockImdbSearch(query, year) {
  const q = (query || "").toLowerCase();
  let results = mockImdbPool.filter(
    (r) =>
      r.title.toLowerCase().includes(q) || r.imdb_id.toLowerCase().includes(q),
  );
  if (year)
    results = results.filter((r) =>
      Math.abs(r.year - year) <= 1 || results.length <= 1
        ? true
        : r.year === year,
    );
  // if exact year match exists, prioritise it
  if (year) {
    const exact = results.filter((r) => r.year === year);
    if (exact.length)
      results = exact.concat(results.filter((r) => r.year !== year));
  }
  // de-dup by imdb_id
  const seen = new Set();
  return results.filter((r) =>
    seen.has(r.imdb_id) ? false : (seen.add(r.imdb_id), true),
  );
}

export function mockImdbDetails(imdb_id) {
  return mockImdbPool.find((r) => r.imdb_id === imdb_id) || null;
}

// ---- Formatting helpers ----
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 100 || i < 2 ? 0 : 1)} ${units[i]}`;
}

export function contextLabel(ctx) {
  return (
    {
      alone: "Alone",
      with_wife: "With Wife",
      family_with_kids: "Family with Kids",
    }[ctx] || ctx
  );
}

export function statusLabel(s) {
  return (
    {
      watched: "Watched",
      unwatched: "Unwatched",
      watching: "Watching",
      missing: "Missing",
    }[s] || s
  );
}

export function fullName(p) {
  return p ? `${p.first_name} ${p.last_name}` : "—";
}

export function driveUsedSpace(db, driveId) {
  let used = 0;
  for (const m of db.media) {
    for (const f of m.files || []) {
      if (f.hard_drive_id === driveId) used += f.file_size || 0;
    }
  }
  return used;
}

// Bottom-up series progress
export function seriesProgress(media) {
  if (!media.seasons || !media.seasons.length)
    return { watched: 0, total: 0, pct: 0, avgRating: null };
  let watched = 0;
  let total = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  for (const season of media.seasons) {
    for (const ep of season.episodes || []) {
      total++;
      if (ep.watch_status === "watched") watched++;
      if (ep.imdb_rating) {
        ratingSum += ep.imdb_rating;
        ratingCount++;
      }
    }
  }
  return {
    watched,
    total,
    pct: total ? Math.round((watched / total) * 100) : 0,
    avgRating: ratingCount ? +(ratingSum / ratingCount).toFixed(1) : null,
  };
}
