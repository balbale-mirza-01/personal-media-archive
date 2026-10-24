import React, { useMemo, useRef, useState } from "react";
import {
  X,
  FileSpreadsheet,
  ClipboardPaste,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import {
  IMPORT_FIELDS,
  guessMapping,
  mapRowsToMedia,
  parseSpreadsheetFile,
  parseClipboardText,
} from "@/lib/bulkImport";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "file", label: "Excel / CSV file", icon: FileSpreadsheet },
  { id: "clipboard", label: "Paste from clipboard", icon: ClipboardPaste },
];

export function ImportDialog({ onClose }) {
  const { bulkImportMedia } = useStore();
  const [tab, setTab] = useState("file");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [mode, setMode] = useState("skip");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef(null);

  const applyParsed = ({ headers: h, rows: r }) => {
    if (!h.length || !r.length) {
      setError(
        "No data rows found. Make sure the first row contains column headers.",
      );
      return;
    }
    setError("");
    setHeaders(h);
    setRows(r);
    setMapping(guessMapping(h));
    setResult(null);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      applyParsed(await parseSpreadsheetFile(file));
    } catch (err) {
      setError(`Could not read file: ${err.message}`);
    }
    e.target.value = "";
  };

  const onPasteParse = () => {
    if (!pasteText.trim()) {
      setError("Paste some rows first (copy from Excel or a CSV file).");
      return;
    }
    applyParsed(parseClipboardText(pasteText));
  };

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const preview = useMemo(
    () => mapRowsToMedia(rows.slice(0, 5), mapping),
    [rows, mapping],
  );
  const valid = !!mapping.title_english || !!mapping.imdb_id;

  const doImport = () => {
    const media = mapRowsToMedia(rows, mapping);
    const res = bulkImportMedia(media, mode);
    setResult(res);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto scrollbar-thin rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border bg-card">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Upload className="h-5 w-5 text-teal-500" /> Bulk Import Media
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Tabs */}
          <div className="flex rounded-xl border border-border overflow-hidden w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                )}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>

          {tab === "file" ? (
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-colors"
              >
                <FileSpreadsheet className="h-6 w-6" />
                <span className="text-sm font-medium">
                  Choose an .xlsx, .xls or .csv file
                </span>
                <span className="text-xs text-slate-400">
                  First row must contain column headers
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={onFile}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={
                  "Paste rows copied from Excel (tab-separated) or CSV, e.g.\nTitle\tYear\tIMDb Rating\nInception\t2010\t8.8"
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              <button
                onClick={onPasteParse}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-teal-400"
              >
                <ClipboardPaste className="h-4 w-4" /> Parse pasted rows
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/50 px-4 py-2.5 text-sm text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {/* Column mapping */}
          {headers.length > 0 && (
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                Column mapping{" "}
                <span className="font-normal text-slate-400">
                  ({mappedCount}/{headers.length} auto-mapped)
                </span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {headers.map((h) => (
                  <label key={h} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-40 truncate text-slate-500 dark:text-slate-400"
                      title={h}
                    >
                      {h}
                    </span>
                    <select
                      value={mapping[h] || ""}
                      onChange={(e) =>
                        setMapping((p) => ({ ...p, [h]: e.target.value }))
                      }
                      className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                    >
                      <option value="">— ignore —</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {!valid && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Map at least one of “Title (English)” or “IMDb ID” to import.
                </p>
              )}

              {/* Duplicate handling */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-500 dark:text-slate-400">
                  On duplicate (imdb_id or title+year):
                </span>
                {[
                  ["skip", "Skip new row"],
                  ["update", "Update existing"],
                  ["create", "Create anyway"],
                ].map(([v, l]) => (
                  <label
                    key={v}
                    className="inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="dup-mode"
                      checked={mode === v}
                      onChange={() => setMode(v)}
                      className="accent-teal-600"
                    />
                    {l}
                  </label>
                ))}
              </div>

              {/* Preview */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  Preview ({rows.length} rows total)
                </h4>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">IMDb ID</th>
                        <th className="px-3 py-2">Year</th>
                        <th className="px-3 py-2">Rating</th>
                        <th className="px-3 py-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((m, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2 text-foreground">
                            {m.title_english || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {m.imdb_id || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {m.release_year ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {m.imdb_rating ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {m.type || "movie"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {result ? (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                  Import finished — {result.created} created, {result.updated}{" "}
                  updated, {result.skipped} skipped (of {result.total} rows).
                </div>
              ) : (
                <button
                  onClick={doImport}
                  disabled={!valid}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
                    valid
                      ? "bg-teal-600 hover:bg-teal-700 text-white"
                      : "bg-slate-200 text-slate-400 dark:bg-slate-700/50 cursor-not-allowed",
                  )}
                >
                  <Upload className="h-4 w-4" /> Import {rows.length} rows
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
