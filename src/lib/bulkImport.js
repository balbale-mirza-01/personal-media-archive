// Bulk-import parsing helpers: Excel/CSV files, pasted clipboard text.
// Shared by the Catalog Import dialog and the Settings backup section.
import Papa from "papaparse";
import * as XLSX from "xlsx";

// Canonical MediaItem fields a user may map spreadsheet columns to.
export const IMPORT_FIELDS = [
  { key: "imdb_id", label: "IMDb ID (tt…)" },
  { key: "title_english", label: "Title (English)", required: true },
  { key: "title_original", label: "Title (Original)" },
  { key: "type", label: "Type (movie/series)" },
  { key: "release_year", label: "Release Year" },
  { key: "end_year", label: "End Year" },
  { key: "runtime", label: "Runtime (min)" },
  { key: "imdb_rating", label: "IMDb Rating" },
  { key: "imdb_votes", label: "IMDb Votes" },
  { key: "personal_rating", label: "Personal Rating" },
  { key: "mpa_rating", label: "MPA Rating" },
  { key: "aspect_ratio", label: "Aspect Ratio" },
  { key: "languages", label: "Languages (comma-sep)" },
  { key: "countries", label: "Countries (comma-sep)" },
  { key: "plot_summary", label: "Plot Summary" },
  { key: "watch_status", label: "Watch Status" },
  { key: "watchlist_context", label: "Watchlist Context" },
  { key: "notes", label: "Notes" },
];

const NUMERIC_KEYS = new Set([
  "release_year",
  "end_year",
  "runtime",
  "imdb_rating",
  "imdb_votes",
  "personal_rating",
]);
const LIST_KEYS = new Set(["languages", "countries"]);

// Fuzzy header → field mapping so common exports auto-map without user input.
const HEADER_HINTS = {
  imdbid: "imdb_id",
  imdb_id: "imdb_id",
  tt: "imdb_id",
  title: "title_english",
  english: "title_english",
  name: "title_english",
  original: "title_original",
  type: "type",
  year: "release_season_year_placeholder", // resolved below
  releaseyear: "release_year",
  endyear: "end_year",
  runtime: "runtime",
  rating: "imdb_rating",
  votes: "imdb_votes",
  personalrating: "personal_rating",
  mpa: "mpa_rating",
  certificate: "mpa_rating",
  aspect: "aspect_ratio",
  language: "languages",
  country: "countries",
  plot: "plot_summary",
  status: "watch_status",
  context: "watchlist_context",
  notes: "notes",
};

export function guessMapping(headers) {
  const used = new Set();
  const map = {};
  for (const h of headers) {
    const norm = String(h || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    let field = null;
    if (norm === "year") field = "release_year";
    else if (
      HEADER_HINTS[norm] &&
      HEADER_HINTS[norm] !== "release_season_year_placeholder"
    )
      field = HEADER_HINTS[norm];
    else
      field =
        IMPORT_FIELDS.find((f) => f.key.replace(/_/g, "") === norm)?.key ||
        null;
    if (field && !used.has(field)) {
      used.add(field);
      map[h] = field;
    }
  }
  return map;
}

function coerce(field, raw) {
  const v = typeof raw === "string" ? raw.trim() : raw;
  if (v === "" || v == null) return undefined;
  if (NUMERIC_KEYS.has(field)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (LIST_KEYS.has(field)) {
    return String(v)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (field === "type") {
    const t = String(v).toLowerCase();
    return t.startsWith("ser") ? "series" : "movie";
  }
  if (field === "imdb_id") {
    const t = String(v).trim();
    return /^tt\d+$/i.test(t) ? t.toLowerCase() : t;
  }
  return String(v);
}

// Convert parsed rows ({header: value}) into partial MediaItem objects.
export function mapRowsToMedia(rows, mapping) {
  const out = [];
  for (const row of rows) {
    const media = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (!field) continue;
      const val = coerce(field, row[header]);
      if (val !== undefined) media[field] = val;
    }
    if (media.title_english || media.imdb_id) out.push(media);
  }
  return out;
}

// Read an .xlsx/.xls/.csv File into { headers, rows }.
export async function parseSpreadsheetFile(file) {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) =>
          resolve({
            headers: res.meta.fields || [],
            rows: res.data.filter((r) =>
              Object.values(r).some((v) => String(v ?? "").trim()),
            ),
          }),
        error: reject,
      });
    });
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const headers = json.length ? Object.keys(json[0]) : [];
  return { headers, rows: json };
}

// Parse pasted clipboard text (TSV from Excel copy, or CSV).
export function parseClipboardText(text) {
  const res = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return {
    headers: res.meta.fields || [],
    rows: res.data.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").trim()),
    ),
  };
}

// Serialize current db.media to CSV string (backup/export parity with import columns).
export function mediaToCsv(db) {
  const cols = IMPORT_FIELDS.map((f) => f.key);
  const esc = (v) => {
    if (v == null) return "";
    const s = Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const m of db.media) {
    lines.push(cols.map((c) => esc(m[c])).join(","));
  }
  return lines.join("\n");
}

// Build a single-sheet workbook from db.media and download it as .xlsx.
export function exportMediaXlsx(db) {
  const data = db.media.map((m) => {
    const row = {};
    for (const f of IMPORT_FIELDS) {
      const v = m[f.key];
      row[f.label] = Array.isArray(v) ? v.join(", ") : (v ?? "");
    }
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Media");
  XLSX.writeFile(
    wb,
    `media-archive-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
