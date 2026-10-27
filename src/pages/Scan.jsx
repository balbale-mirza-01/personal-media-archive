import React, { useState } from "react";
import {
  ScanSearch,
  Folder,
  FileVideo,
  Search,
  Check,
  Loader2,
  Plus,
  ClipboardPaste,
  HardDrive,
} from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { parseFilename, mockImdbSearch, uid } from "@/lib/store";
import { scanApi } from "@/api/endpoints";
import { getToken } from "@/api/client";
import { QualityBadge, MpaBadge } from "@/components/Badge";
import { RatingPill } from "@/components/Stars";
import { cn } from "@/lib/utils";

const SAMPLE_PATHS = [
  "HDD1:/Movies/Sci-Fi/Inception.2010.1080p.BluRay.DD+5.1.x264-playHD.mkv",
  "HDD1:/Movies/Action/One.Battle.After.Another.2025.720p.BluRay.mkv",
  "HDD1:/Series/Mrs.Maisel/The.Marvelous.Mrs.Maisel.S01E01.Pilot.720p.AMZN.WEB-DL.DDP5.1.H.264-NTb.mkv",
  "HDD2:/Movies/Sci-Fi/Dune.2021.2160p.UHD.BluRay.mkv",
];

const STEPS = ["Parse", "Search IMDb", "Confirm", "Add to Catalog"];

export default function Scan() {
  const { db, addMedia } = useStore();
  const [mode, setMode] = useState("folder"); // folder | bulk
  const [selectedDrive, setSelectedDrive] = useState(
    db.hardDrives[0]?.id || "",
  );
  const [folderPath, setFolderPath] = useState("HDD1:/Movies/Sci-Fi/");
  const [bulkText, setBulkText] = useState(SAMPLE_PATHS.join("\n"));
  const [active, setActive] = useState(null); // current scan item
  const [step, setStep] = useState(0); // 0 idle, 1 parsing, 2 searching, 3 results, 4 done
  const [results, setResults] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [added, setAdded] = useState([]);
  const [log, setLog] = useState([]);

  const filenames =
    mode === "folder"
      ? SAMPLE_PATHS.filter((p) =>
          p
            .toLowerCase()
            .startsWith(folderPath.toLowerCase().split(":")[0].toLowerCase()),
        )
      : bulkText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

  const appendLog = (msg) =>
    setLog((l) => [
      ...l,
      { id: uid("log"), msg, time: new Date().toLocaleTimeString() },
    ]);

  const startScan = (filename) => {
    const parsed = parseFilename(filename.split("/").pop());
    setActive({ filename, parsed });
    setStep(1);
    setResults([]);
    setChosen(null);
    appendLog(`Parsing "${filename.split("/").pop()}"…`);
    setTimeout(async () => {
      setStep(2);
      appendLog(
        `Detected: "${parsed.title}"${parsed.year ? ` (${parsed.year})` : ""}${parsed.isSeries ? ` · S${parsed.season}E${parsed.episode}` : ""}${parsed.quality ? ` · ${parsed.quality}` : ""}`,
      );
      appendLog(getToken() ? "Querying IMDb via backend…" : "Querying IMDb…");
      let res;
      try {
        if (getToken()) {
          // Real backend matcher (Phase 6): candidate list for verification.
          const data = await scanApi.imdbSearch(
            parsed.title,
            parsed.year || undefined,
            parsed.isSeries ? "series" : "movie",
          );
          res = (data.candidates || data.results || []).map((c) => ({
            imdb_id: c.imdb_id,
            title: c.title,
            year: c.year,
            type:
              c.media_type || c.type || (parsed.isSeries ? "series" : "movie"),
            rating: c.rating ?? null,
            genres: c.genres || [],
            mpa: c.mpa_rating || c.mpa || "",
            runtime: c.runtime_minutes ?? c.runtime ?? null,
          }));
        } else {
          res = mockImdbSearch(parsed.title, parsed.year);
        }
      } catch (e) {
        appendLog(`Backend search failed (${e.message}); using local pool.`);
        res = mockImdbSearch(parsed.title, parsed.year);
      }
      setResults(res);
      setStep(3);
      appendLog(
        res.length
          ? `Found ${res.length} candidate match${res.length > 1 ? "es" : ""}.`
          : "No IMDb matches found.",
      );
    }, 500);
  };

  const confirmAndAdd = (match) => {
    setChosen(match);
    setStep(4);
    appendLog(`Confirmed: ${match.imdb_id} — ${match.title} (${match.year})`);
    const parsed = active.parsed;
    const drive = db.hardDrives.find((h) => h.id === selectedDrive);
    const newMedia = {
      imdb_id: match.imdb_id,
      title_original: match.title,
      title_english: match.title,
      type: match.type,
      release_year: match.year,
      end_year: null,
      imdb_rating: match.rating,
      imdb_votes: 0,
      personal_rating: 0,
      runtime: match.runtime,
      languages: ["English"],
      countries: ["USA"],
      aspect_ratio: "2.39:1",
      mpa_rating: match.mpa,
      parents_guide_notes: {},
      personal_parental_notes: "",
      watch_status: "unwatched",
      watchlist_context: "alone",
      watchlist_added_at: new Date().toISOString().slice(0, 10),
      notes: `Imported via scan from ${active.filename}`,
      genre_ids: (match.genres || [])
        .map((gn) =>
          typeof gn === "string"
            ? db.genres.find((g) => g.name === gn)?.id
            : String(gn.id),
        )
        .filter(Boolean),
      cast: [],
      crew: [],
      files: [
        {
          id: uid("f"),
          // In API mode the backend links files to drives by mount_path, so
          // send a real path; in local mode keep the drive-relative label.
          hard_drive_id: selectedDrive,
          file_path: getToken()
            ? (drive?.mount_path || "") +
              "/" +
              active.filename.replace(/^.*?:/, "").replace(/^\//, "")
            : active.filename,
          file_size: 0,
          is_multi_part: false,
          part_number: 1,
          version_tag: parsed.quality
            ? `${parsed.quality} ${parsed.source || ""}`.trim()
            : "Imported",
        },
      ],
    };
    const created = addMedia(newMedia);
    setAdded((a) => [created, ...a]);
    appendLog(`Added to catalog on ${drive?.label}. ✓`);
  };

  const reset = () => {
    setActive(null);
    setStep(0);
    setResults([]);
    setChosen(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: input config */}
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-4">Import Source</h3>
          <div className="flex rounded-lg border border-border overflow-hidden mb-4">
            <button
              onClick={() => setMode("folder")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-2 py-2 text-sm font-medium",
                mode === "folder"
                  ? "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"
                  : "text-slate-500",
              )}
            >
              <Folder className="h-4 w-4" /> Folder Scan
            </button>
            <button
              onClick={() => setMode("bulk")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-2 py-2 text-sm font-medium",
                mode === "bulk"
                  ? "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"
                  : "text-slate-500",
              )}
            >
              <ClipboardPaste className="h-4 w-4" /> Bulk List
            </button>
          </div>

          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Target Hard Drive
          </label>
          <select
            value={selectedDrive}
            onChange={(e) => setSelectedDrive(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            {db.hardDrives.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label} — {h.name}
              </option>
            ))}
          </select>

          {mode === "folder" ? (
            <>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Folder Path
              </label>
              <input
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                Simulated scan of files under this path.
              </p>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Filenames / IMDb IDs (one per line)
              </label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
            </>
          )}

          <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 p-3">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              {filenames.length} file(s) ready to scan
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
              {filenames.map((f, i) => (
                <button
                  key={i}
                  onClick={() => startScan(f)}
                  disabled={step > 0 && step < 4}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileVideo className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{f.split("/").pop()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Activity log */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-3">Activity Log</h3>
          {log.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No activity yet. Click a file to scan.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
              {log.map((l) => (
                <div
                  key={l.id}
                  className="text-xs font-mono text-slate-500 dark:text-slate-400"
                >
                  <span className="text-slate-400 dark:text-slate-600">
                    {l.time}
                  </span>{" "}
                  {l.msg}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: matching simulator */}
      <div className="lg:col-span-2">
        <div className="rounded-xl border border-border bg-card p-6 min-h-[500px]">
          {!active ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-500 dark:bg-teal-500/10 dark:text-teal-400 mb-4">
                <ScanSearch className="h-8 w-8" />
              </div>
              <h3 className="font-semibold text-foreground">
                IMDb Matching Simulator
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                Select a file on the left to simulate parsing, IMDb lookup,
                confirmation, and catalog import.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Stepper */}
              <div className="flex items-center gap-1">
                {STEPS.map((label, i) => {
                  const stepIndex = i + 1;
                  const done = step > stepIndex || step === 4;
                  const current = step === stepIndex;
                  return (
                    <React.Fragment key={label}>
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          current && "text-teal-600 dark:text-teal-400",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors",
                            done
                              ? "bg-teal-500 border-teal-500 text-white"
                              : current
                                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                                : "border-slate-200 dark:border-slate-700 text-slate-400",
                          )}
                        >
                          {done ? <Check className="h-3.5 w-3.5" /> : stepIndex}
                        </span>
                        <span className="text-xs font-medium hidden sm:inline">
                          {label}
                        </span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div
                          className={cn(
                            "flex-1 h-0.5 rounded",
                            done
                              ? "bg-teal-500"
                              : "bg-slate-200 dark:bg-slate-700",
                          )}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Step content */}
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Source File
                </p>
                <p className="font-mono text-sm text-foreground break-all">
                  {active.filename}
                </p>
              </div>

              {step >= 1 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">
                    Step 1 — Parsed Filename
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <ParsedField label="Title" value={active.parsed.title} />
                    <ParsedField
                      label="Year"
                      value={active.parsed.year || "—"}
                    />
                    <ParsedField
                      label="Quality"
                      value={active.parsed.quality || "—"}
                    />
                    <ParsedField
                      label="Type"
                      value={
                        active.parsed.isSeries
                          ? `Series S${active.parsed.season}E${active.parsed.episode}`
                          : "Movie"
                      }
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Querying IMDb
                  database…
                </div>
              )}

              {step >= 3 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">
                    Step 2 — IMDb Search Results
                  </h4>
                  {results.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      No matches. Try another file.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {results.map((r, i) => (
                        <button
                          key={r.imdb_id + i}
                          onClick={() => confirmAndAdd(r)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all",
                            chosen?.imdb_id === r.imdb_id
                              ? "border-teal-500 bg-teal-50 dark:bg-teal-500/10"
                              : "border-border bg-card hover:border-teal-400",
                          )}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/50 text-slate-500">
                            <Search className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {r.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              {r.imdb_id} · {r.year} · {r.type}
                            </p>
                          </div>
                          <RatingPill value={r.rating} />
                          <MpaBadge mpa={r.mpa} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 4 && chosen && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">
                    Step 3 & 4 — Confirmed & Added
                  </h4>
                  <div className="rounded-lg border border-teal-400 bg-teal-50 dark:bg-teal-500/10 p-4">
                    <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-medium mb-2">
                      <Check className="h-5 w-5" /> Added to catalog
                    </div>
                    <p className="text-sm text-foreground">
                      {chosen.title} ({chosen.year})
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
                      {chosen.imdb_id} · attached to{" "}
                      {db.hardDrives.find((h) => h.id === selectedDrive)?.label}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      {active.parsed.quality && (
                        <QualityBadge quality={active.parsed.quality} />
                      )}
                      <MpaBadge mpa={chosen.mpa} />
                      <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {
                          db.hardDrives.find((h) => h.id === selectedDrive)
                            ?.label
                        }
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={reset}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-teal-400"
                  >
                    <Plus className="h-4 w-4" /> Scan another file
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Added this session */}
        {added.length > 0 && (
          <div className="mt-5 rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold text-foreground mb-3">
              Added This Session ({added.length})
            </h3>
            <div className="space-y-2">
              {added.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <Check className="h-4 w-4 text-emerald-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.title_english}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {m.imdb_id}
                    </p>
                  </div>
                  <RatingPill value={m.imdb_rating} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ParsedField({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  );
}
