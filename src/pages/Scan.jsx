import React, { useMemo, useRef, useState } from "react";
import {
  ScanSearch,
  FolderOpen,
  ClipboardPaste,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  FileVideo,
  Trash2,
  RefreshCw,
  ListChecks,
} from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { parseFilename, mockImdbSearch, uid } from "@/lib/store";
import { scanApi } from "@/api/endpoints";
import { getToken } from "@/api/client";
import { cn } from "@/lib/utils";

const VIDEO_EXT = [".mkv", ".mp4"];
const IMDB_ID_RE = /^tt\d{7,10}$/i;

const SAMPLE_BULK = [
  "tt10370710",
  "https://www.imdb.com/title/tt0133093/",
  "The.Matrix.1999.1080p.BluRay.x264-GRP.mkv",
  "Dune (2021)",
  "Breaking.Bad.S01E03.720p.WEB-DL.x264-NTb.mkv",
].join("\n");

// ---------- small presentational helpers ----------
function StatusBadge({ status }) {
  const map = {
    verified_id: ["Verified ID", "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"],
    auto_matched: ["Auto Matched", "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"],
    needs_review: ["Needs Review", "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"],
    no_match: ["No Match", "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"],
    manual: ["Manual ID", "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"],
    selected: ["Selected", "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"],
  };
  const [label, cls] = map[status] || ["—", "bg-slate-100 text-slate-500"];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", cls)}>
      {label}
    </span>
  );
}

function ConfPill({ value }) {
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  const pct = Math.round(value * 100);
  const tone =
    pct >= 90 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-rose-600";
  return <span className={cn("text-xs font-semibold tabular-nums", tone)}>{pct}%</span>;
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

// Map one backend bulk-match row -> local editable match row.
function rowToMatch(r) {
  const candidates = (r.candidates || []).map((c) => ({
    imdb_id: c.imdb_id,
    title: c.title,
    year: c.year,
    type: c.media_type === "series" ? "series" : "movie",
    poster_url: c.poster_url || "",
  }));
  let status = "needs_review";
  let confirmed = false;
  let chosenId = r.imdb_id || "";
  if (r.status === "verified_id") { status = "verified_id"; confirmed = true; }
  else if (r.status === "auto_matched") { status = "auto_matched"; confirmed = true; }
  else if (r.status === "no_match") { status = "no_match"; chosenId = ""; }
  return {
    id: uid("mrow"),
    query: r.query || "",
    parsed_title: r.parsed_title || "",
    year: r.year ?? null,
    kind: r.kind || "title",
    files: r.files || [],
    status,
    confirmed,
    confidence: r.confidence || 0,
    chosen_id: chosenId,
    candidates,
    manual_id: "",
  };
}

// Local (offline/demo) matcher used when no backend token is present.
function localMatchRow(line) {
  const parsed = parseFilename(line.split("/").pop());
  const idMatch = line.match(/\b(tt\d{7,10})\b/i);
  if (idMatch) {
    const pool = mockImdbSearch("", null);
    const hit = (pool || []).find((p) => p.imdb_id === idMatch[1]);
    return {
      id: uid("mrow"), query: line, parsed_title: line.trim(), year: null,
      kind: "imdb_id", files: [], status: "verified_id", confirmed: true,
      confidence: 1, chosen_id: idMatch[1],
      candidates: [{ imdb_id: idMatch[1], title: hit?.title || idMatch[1], year: hit?.year || null, type: hit?.type || "movie" }],
      manual_id: "",
    };
  }
  const res = mockImdbSearch(parsed.title, parsed.year).map((c) => ({
    imdb_id: c.imdb_id, title: c.title, year: c.year, type: c.type,
  }));
  const best = res[0];
  const exact =
    best &&
    best.title.toLowerCase().trim() === parsed.title.toLowerCase().trim() &&
    (!parsed.year || !best.year || Math.abs(best.year - parsed.year) <= 1);
  return {
    id: uid("mrow"), query: line, parsed_title: parsed.title, year: parsed.year,
    kind: parsed.isSeries ? "episode" : "title", files: [],
    status: best ? (exact ? "auto_matched" : "needs_review") : "no_match",
    confirmed: Boolean(best && exact),
    confidence: exact ? 1 : best ? 0.6 : 0,
    chosen_id: exact ? best.imdb_id : "",
    candidates: res, manual_id: "",
  };
}

export default function Scan() {
  const { db, mode, refresh, addMedia } = useStore();
  const fileInputRef = useRef(null);

  // ----- US4: folder scanner state -----
  const [scannedFiles, setScannedFiles] = useState([]);
  const [scanSkipped, setScanSkipped] = useState(0);
  const [scanning, setScanning] = useState(false);

  // ----- US3: batch list + review table state -----
  const [bulkText, setBulkText] = useState(SAMPLE_BULK);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [manualEdits, setManualEdits] = useState({}); // rowId -> tt id text
  const [notice, setNotice] = useState(null); // {kind:'ok'|'err', msg}

  // ----- US1: import state -----
  const [importing, setImporting] = useState(false);
  const [log, setLog] = useState([]);

  const appendLog = (msg) =>
    setLog((l) => [...l, { id: uid("log"), msg, time: new Date().toLocaleTimeString() }]);

  const notify = (kind, msg) => {
    setNotice({ kind, msg });
    setTimeout(() => setNotice((n) => (n && n.msg === msg ? null : n)), 6000);
  };

  // ================= User Story 4 — client-side folder scanner =================
  const onPickFolder = (e) => {
    const fileList = Array.from(e.target.files || []);
    setScanning(true);
    // Defer heavy mapping so the spinner paints for very large trees.
    setTimeout(() => {
      let skipped = 0;
      const videos = [];
      for (const f of fileList) {
        const rel = f.webkitRelativePath || f.name || "";
        const name = (rel.split(/[\\/]/).pop() || f.name || "").toLowerCase();
        if (!VIDEO_EXT.some((ext) => name.endsWith(ext))) {
          skipped += 1;
          continue;
        }
        videos.push({
          id: uid("f"),
          name: rel.split(/[\\/]/).pop() || f.name,
          relPath: rel,
          size: f.size,
        });
      }
      setScannedFiles(videos);
      setScanSkipped(skipped);
      setScanning(false);
      appendLog(`Folder scan: ${videos.length} video file(s), ${skipped} non-video skipped.`);
      if (!fileList.length) appendLog("No files were returned by the folder picker.");
    }, 30);
    // Reset input value so the same folder can be re-picked.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const proceedToMatch = () => {
    const lines = scannedFiles.map((f) => f.relPath || f.name);
    if (!lines.length) return;
    setBulkText(lines.join("\n"));
    appendLog(`Proceeding to match ${lines.length} scanned file(s)…`);
    runBatchMatch(lines);
  };

  // ================= User Story 3 — batch query processing & matching =================
  async function runBatchMatch(linesArg) {
    const lines = (linesArg ?? bulkText.split("\n"))
      .map((l) => String(l).trim())
      .filter(Boolean);
    if (!lines.length) {
      setMatchError("Enter at least one line (IMDb id, URL, title or filename).");
      return;
    }
    setMatchError("");
    setMatching(true);
    setRows([]);
    setSummary(null);
    try {
      if (getToken() && mode !== "local") {
        const data = await scanApi.bulkMatch(lines);
        const mapped = (data.rows || []).map((r) => ({
          ...rowToMatch(r),
          files: lines.includes(r.query)
            ? scannedFiles.filter((f) => (f.relPath || f.name) === r.query)
            : [],
        }));
        setRows(mapped);
        setSummary(data.summary || null);
        appendLog(
          `Batch match: ${mapped.length} row(s) — ` +
            `${data.summary?.auto_matched ?? 0} auto, ${data.summary?.verified_id ?? 0} verified, ` +
            `${data.summary?.needs_review ?? 0} review, ${data.summary?.no_match ?? 0} unmatched.`,
        );
      } else {
        // Demo/local mode: simulate per-line latency then match against local pool.
        await new Promise((res) => setTimeout(res, 400));
        const mapped = lines.map(localMatchRow);
        setRows(mapped);
        setSummary({
          total: mapped.length,
          auto_matched: mapped.filter((r) => r.status === "auto_matched").length,
          verified_id: mapped.filter((r) => r.status === "verified_id").length,
          needs_review: mapped.filter((r) => r.status === "needs_review").length,
          no_match: mapped.filter((r) => r.status === "no_match").length,
        });
        appendLog(`Local batch match over ${mapped.length} line(s).`);
      }
    } catch (err) {
      setMatchError(err.message || "Batch matching failed.");
      appendLog(`Batch match failed: ${err.message}`);
    } finally {
      setMatching(false);
    }
  }

  const updateRow = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const onPickCandidate = (row, imdbId) => {
    const cand = row.candidates.find((c) => c.imdb_id === imdbId);
    if (!cand) return;
    updateRow(row.id, {
      chosen_id: imdbId,
      status: "selected",
      confirmed: true,
      confidence: 1,
      matchTitle: cand.title,
      matchYear: cand.year,
    });
    appendLog(`Selected candidate ${imdbId} (${cand.title}) for "${row.query}"`);
  };

  const onManualId = (row, value) => {
    setManualEdits((m) => ({ ...m, [row.id]: value }));
    const v = value.trim();
    if (IMDB_ID_RE.test(v)) {
      updateRow(row.id, {
        chosen_id: v,
        status: "manual",
        confirmed: true,
        confidence: 1,
        matchTitle: row.candidates.find((c) => c.imdb_id === v)?.title || v,
      });
    } else {
      updateRow(row.id, { chosen_id: "", confirmed: false });
    }
  };

  const confirmAllHigh = () =>
    setRows((rs) =>
      rs.map((r) =>
        (r.status === "auto_matched" || r.status === "verified_id") && !r.confirmed
          ? { ...r, confirmed: true }
          : r,
      ),
    );

  const confirmedRows = useMemo(() => rows.filter((r) => r.confirmed && r.chosen_id), [rows]);

  // ================= User Story 1 — bulk import via /ingest/ =================
  async function importConfirmed() {
    if (!confirmedRows.length) return;
    setImporting(true);
    appendLog(`Importing ${confirmedRows.length} confirmed item(s) via IMDb scrape…`);
    try {
      if (getToken() && mode !== "local") {
        const selections = confirmedRows.map((r) => {
          const kind =
            r.kind === "episode" ? "series"
              : r.candidates.find((c) => c.imdb_id === r.chosen_id)?.type === "series" ? "series"
              : "movie";
          const files = (r.files || []).map((f) => ({
            file_path: f.relPath || f.name,
            file_name: f.name,
            file_size_bytes: f.size,
          }));
          const sel = {
            imdb_id: r.chosen_id,
            kind,
            title_guess: r.parsed_title || undefined,
            year: r.year || undefined,
          };
          if (kind === "series") {
            // Group scanned episode files under season 1 as a starting point;
            // ingest accepts seasons:[{season, episodes:[{episode, files}]}].
            const epNums = (r.query.match(/S(\d{1,2})E(\d{1,3})/i) || []).slice(1);
            const season = epNums[0] ? parseInt(epNums[0], 10) : 1;
            const episode = epNums[1] ? parseInt(epNums[1], 10) : 1;
            sel.seasons = [{ season, episodes: [{ episode, files }] }];
          } else {
            sel.files = files;
          }
          return sel;
        });
        const data = await scanApi.ingest(selections);
        const results = data.results || [];
        const ok = results.filter((x) => x.status === "ok").length;
        const failed = results.filter((x) => x.status === "error");
        failed.forEach((f) => appendLog(`Import error ${f.imdb_id}: ${f.error}`));
        appendLog(`Import done: ${ok}/${results.length} succeeded.`);
        notify(ok === results.length ? "ok" : "err",
          ok === results.length
            ? `Successfully imported ${ok} item(s) into the catalog.`
            : `Imported ${ok} item(s); ${failed.length} failed (see activity log).`);
        await refresh();
      } else {
        // Local demo import: create catalog entries through the store.
        for (const r of confirmedRows) {
          const cand = r.candidates.find((c) => c.imdb_id === r.chosen_id) || {};
          await addMediaLocal({
            imdb_id: r.chosen_id,
            title: cand.title || r.parsed_title || r.chosen_id,
            year: cand.year || r.year,
            type: cand.type || "movie",
            source_query: r.query,
          });
        }
        notify("ok", `Added ${confirmedRows.length} item(s) to the local catalog.`);
      }
      setRows((rs) => rs.filter((r) => !(r.confirmed && r.chosen_id)));
    } catch (err) {
      notify("err", `Import failed: ${err.message}`);
      appendLog(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }

  // Minimal local-mode add (mirrors what MediaFormModal expects).
  async function addMediaLocal(m) {
    await addMedia({
      title_original: m.title,
      title_english: m.title,
      imdb_id: m.imdb_id,
      type: m.type,
      release_year: m.year,
      end_year: null,
      imdb_rating: null,
      imdb_votes: 0,
      personal_rating: 0,
      runtime: null,
      languages: [],
      countries: [],
      mpa_rating: "",
      parents_guide_notes: {},
      personal_parental_notes: "",
      watch_status: "unwatched",
      notes: `Imported via bulk match from "${m.source_query}"`,
      genre_ids: [],
      cast: [],
      crew: [],
      files: (m.files || []).map((f) => ({
        id: uid("f"), hard_drive_id: "", file_path: f.file_path,
        file_size: f.file_size_bytes || 0, is_multi_part: false, part_number: 1,
      })),
    });
    appendLog(`Added "${m.title}" (${m.imdb_id}) to catalog.`);
  }

  const driveOptions = db.hardDrives || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-teal-50 p-2 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400">
            <ScanSearch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Scan &amp; Bulk Import</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Scan a folder, batch-match mixed lists against IMDb, review matches, then import.
            </p>
          </div>
        </div>
        {notice && (
          <div
            role="status"
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
              notice.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400",
            )}
          >
            {notice.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {notice.msg}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ---------- Left column: US4 folder scanner + bulk list ---------- */}
        <div className="space-y-6">
          {/* Folder Scanner */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-foreground">
              <FolderOpen className="h-4 w-4 text-teal-600" /> Folder Scanner
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Pick a folder on this device. Only <code>.mkv</code> / <code>.mp4</code> files are kept
              (works in Chrome, Firefox, Safari &amp; Edge). Nothing leaves your browser until you match.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mkv,.mp4,video/*"
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={onPickFolder}
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                Choose Folder…
              </button>
              {scannedFiles.length > 0 && (
                <button
                  onClick={() => { setScannedFiles([]); setScanSkipped(0); }}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Trash2 className="h-4 w-4" /> Clear
                </button>
              )}
            </div>

            {scannedFiles.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {scannedFiles.length} video file(s)
                    {scanSkipped > 0 && ` · ${scanSkipped} non-video ignored`}
                  </span>
                  <button
                    onClick={proceedToMatch}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
                  >
                    <ListChecks className="h-3.5 w-3.5" /> Proceed to Match →
                  </button>
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">File</th>
                        <th className="px-3 py-2 font-medium">Relative Path</th>
                        <th className="px-3 py-2 text-right font-medium">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {scannedFiles.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                          <td className="px-3 py-1.5 font-medium text-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <FileVideo className="h-3.5 w-3.5 text-teal-600" /> {f.name}
                            </span>
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-1.5 font-mono text-slate-500" title={f.relPath}>
                            {f.relPath}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{fmtSize(f.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Bulk List */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-foreground">
              <ClipboardPaste className="h-4 w-4 text-teal-600" /> Bulk Query List
            </h3>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              One item per line: IMDb id (<code>tt#######</code>), IMDb URL, clean title (+year) or messy filename.
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              placeholder={SAMPLE_BULK}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => runBatchMatch()}
                disabled={matching}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {matching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                Run Batch Match
              </button>
              <button
                onClick={() => setBulkText(SAMPLE_BULK)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Load Sample
              </button>
              {driveOptions.length > 0 && (
                <span className="ml-auto text-[11px] text-slate-400">
                  Files link to drives by mount path at import time.
                </span>
              )}
            </div>
            {matchError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {matchError}
              </p>
            )}
          </section>
        </div>

        {/* ---------- Right column: review table + import ---------- */}
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">Match Review</h3>
              {summary && (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Total {summary.total}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600 dark:bg-emerald-500/10">
                    Auto {summary.auto_matched + summary.verified_id}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600 dark:bg-amber-500/10">
                    Review {summary.needs_review}
                  </span>
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600 dark:bg-rose-500/10">
                    Unmatched {summary.no_match}
                  </span>
                </div>
              )}
            </div>

            {matching && (
              <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                Querying IMDb find page (__NEXT_DATA__) per line…
              </div>
            )}

            {!matching && !rows.length && (
              <p className="py-12 text-center text-sm text-slate-400">
                No batch results yet. Scan a folder or paste a bulk list, then run the matcher.
              </p>
            )}

            {!matching && rows.length > 0 && (
              <>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">✓</th>
                        <th className="px-3 py-2 font-medium">Query / Filename</th>
                        <th className="px-3 py-2 font-medium">Suggested Match</th>
                        <th className="px-3 py-2 font-medium">IMDb ID / Link</th>
                        <th className="px-3 py-2 font-medium">Conf.</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Fix</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border align-top">
                      {rows.map((r) => {
                        const chosen = r.candidates.find((c) => c.imdb_id === r.chosen_id);
                        const suggested = chosen?.title || r.candidates[0]?.title || "";
                        const suggestedYear = chosen?.year ?? r.candidates[0]?.year ?? r.year;
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={Boolean(r.confirmed)}
                                disabled={r.status === "no_match"}
                                onChange={(e) =>
                                  updateRow(r.id, { confirmed: e.target.checked })
                                }
                                className="h-4 w-4 accent-teal-600 disabled:opacity-30"
                                aria-label={`Confirm ${r.query}`}
                              />
                            </td>
                            <td className="max-w-[200px] px-3 py-2">
                              <div className="truncate font-medium text-foreground" title={r.query}>
                                {r.query}
                              </div>
                              <div className="truncate text-[11px] text-slate-400">
                                parsed: “{r.parsed_title}”{r.year ? ` (${r.year})` : ""}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-foreground">
                              {suggested ? (
                                <>
                                  <div>{suggested}</div>
                                  <div className="text-[11px] text-slate-400">{suggestedYear ?? "—"}</div>
                                </>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px]">
                              {r.chosen_id ? (
                                <a
                                  href={`https://www.imdb.com/title/${r.chosen_id}/`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-teal-600 hover:underline"
                                >
                                  {r.chosen_id} <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2"><ConfPill value={r.confidence} /></td>
                            <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                            <td className="min-w-[190px] px-3 py-2">
                              {/* 2) alternative from candidate dropdown */}
                              {r.candidates.length > 0 && (
                                <select
                                  value={r.chosen_id || ""}
                                  onChange={(e) => onPickCandidate(r, e.target.value)}
                                  className="mb-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                                >
                                  <option value="">Choose candidate…</option>
                                  {r.candidates.map((c) => (
                                    <option key={c.imdb_id} value={c.imdb_id}>
                                      {c.title} ({c.year ?? "?"}) · {c.imdb_id}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {/* 3) manual exact id for tough/unmatched rows */}
                              <input
                                value={manualEdits[r.id] ?? r.manual_id ?? ""}
                                onChange={(e) => onManualId(r, e.target.value)}
                                placeholder="Paste tt#######"
                                className={cn(
                                  "w-full rounded-md border bg-background px-2 py-1 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500/50",
                                  manualEdits[r.id] && !IMDB_ID_RE.test(manualEdits[r.id])
                                    ? "border-rose-400"
                                    : "border-border",
                                )}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={confirmAllHigh}
                    className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-400"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Confirm All High-Confidence
                  </button>
                  <button
                    onClick={importConfirmed}
                    disabled={!confirmedRows.length || importing}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Import {confirmedRows.length || ""} Confirmed Item(s)
                  </button>
                  <span className="text-[11px] text-slate-400">
                    Import scrapes full details + parental guide (User Story 1) and upserts them.
                  </span>
                </div>
              </>
            )}
          </section>

          {/* Activity log */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-2 font-semibold text-foreground">Activity Log</h3>
            <div className="max-h-48 space-y-1 overflow-auto font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {log.length === 0 && <p className="text-slate-400">—</p>}
              {log.map((l) => (
                <p key={l.id}>
                  <span className="text-slate-400">[{l.time}]</span> {l.msg}
                </p>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
