import React, { useRef, useState } from "react";
import {
  Upload,
  RotateCcw,
  HardDrive,
  Plus,
  Trash2,
  Pencil,
  Database,
  FileJson,
  FileSpreadsheet,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useStore } from "@/lib/StoreContext";
import { Modal, Field } from "./Genres";
import { formatFileSize, driveUsedSpace } from "@/lib/store";

export default function Settings() {
  const {
    db,
    resetToSeed,
    importData,
    addHardDrive,
    updateHardDrive,
    deleteHardDrive,
  } = useStore();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [editingHd, setEditingHd] = useState(null); // 'new' or hd object
  const [hdForm, setHdForm] = useState({
    label: "",
    name: "",
    is_connected: true,
    total_space: "",
  });

  const flash = (text, tone = "success") =>
    setMsg({ text, tone, id: Date.now() });

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: "application/json",
    });
    download(
      blob,
      `media-archive-${new Date().toISOString().slice(0, 10)}.json`,
    );
    flash("Catalog exported as JSON.");
  };

  const exportCSV = () => {
    const rows = [
      [
        "IMDb ID",
        "Title",
        "Type",
        "Year",
        "End Year",
        "IMDb Rating",
        "Personal Rating",
        "Runtime",
        "MPA",
        "Status",
        "Context",
        "Hard Drive",
        "Quality",
        "File Path",
      ],
    ];
    db.media.forEach((m) => {
      const f = m.files?.[0];
      const hd = f
        ? db.hardDrives.find((h) => h.id === f.hard_drive_id)?.label
        : "";
      const q =
        f?.version_tag?.match(/(4K|2160p|1080p|720p|480p|UHD)/i)?.[1] || "";
      rows.push([
        m.imdb_id,
        `"${(m.title_english || "").replace(/"/g, '""')}"`,
        m.type,
        m.release_year,
        m.end_year || "",
        m.imdb_rating,
        m.personal_rating,
        m.runtime,
        m.mpa_rating,
        m.watch_status,
        m.watchlist_context,
        hd,
        q,
        `"${(f?.file_path || "").replace(/"/g, '""')}"`,
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    download(
      new Blob([csv], { type: "text/csv" }),
      `media-archive-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    flash("Catalog exported as CSV.");
  };

  const onImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        importData(data);
        flash("Catalog imported successfully.");
      } catch (err) {
        flash("Import failed: invalid JSON file.", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openNewHd = () => {
    setHdForm({ label: "", name: "", is_connected: true, total_space: "" });
    setEditingHd("new");
  };
  const openEditHd = (h) => {
    setHdForm({ ...h, total_space: h.total_space || "" });
    setEditingHd(h.id);
  };

  const submitHd = (e) => {
    e.preventDefault();
    const payload = {
      label: hdForm.label,
      name: hdForm.name,
      is_connected: !!hdForm.is_connected,
      total_space: hdForm.total_space === "" ? 0 : Number(hdForm.total_space),
    };
    if (editingHd === "new") addHardDrive(payload);
    else updateHardDrive(editingHd, payload);
    setEditingHd(null);
    flash("Hard drive saved.");
  };

  const totalSize = db.media.reduce(
    (sum, m) =>
      sum + (m.files || []).reduce((s, f) => s + (f.file_size || 0), 0),
    0,
  );
  const editingUsed =
    editingHd && editingHd !== "new" ? driveUsedSpace(db, editingHd) : 0;
  const editingFree = Math.max(
    0,
    (Number(hdForm.total_space) || 0) - editingUsed,
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${msg.tone === "error" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"}`}
        >
          {msg.text}
        </div>
      )}

      {/* Backup */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-1">
          <Database className="h-5 w-5 text-teal-500" /> Backup & Export
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Export your full catalog or import a previous backup. Data is stored
          locally in your browser.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={exportJSON}
            className="flex items-start gap-3 rounded-lg border border-border p-4 hover:border-teal-400 hover:bg-teal-50/30 dark:hover:bg-teal-500/5 transition-colors text-left"
          >
            <FileJson className="h-5 w-5 text-teal-500 mt-0.5" />
            <div>
              <p className="font-medium text-foreground text-sm">Export JSON</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Full backup with all relations
              </p>
            </div>
          </button>
          <button
            onClick={exportCSV}
            className="flex items-start gap-3 rounded-lg border border-border p-4 hover:border-teal-400 hover:bg-teal-50/30 dark:hover:bg-teal-500/5 transition-colors text-left"
          >
            <FileSpreadsheet className="h-5 w-5 text-teal-500 mt-0.5" />
            <div>
              <p className="font-medium text-foreground text-sm">Export CSV</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Spreadsheet-friendly catalog
              </p>
            </div>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-start gap-3 rounded-lg border border-border p-4 hover:border-teal-400 hover:bg-teal-50/30 dark:hover:bg-teal-500/5 transition-colors text-left"
          >
            <Upload className="h-5 w-5 text-teal-500 mt-0.5" />
            <div>
              <p className="font-medium text-foreground text-sm">Import JSON</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Restore from a backup file
              </p>
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={onImport}
            className="hidden"
          />
        </div>
      </section>

      {/* Hard drives */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-teal-500" /> Hard Drives
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {db.hardDrives.length} drives · {formatFileSize(totalSize)}{" "}
              tracked
            </p>
          </div>
          <button
            onClick={openNewHd}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-teal-400"
          >
            <Plus className="h-4 w-4" /> Add Drive
          </button>
        </div>
        <div className="space-y-2">
          {db.hardDrives.map((h) => {
            const titles = db.media.filter((m) =>
              (m.files || []).some((f) => f.hard_drive_id === h.id),
            ).length;
            const used = driveUsedSpace(db, h.id);
            const free = Math.max(0, (h.total_space || 0) - used);
            const usedPct = h.total_space
              ? Math.round((used / h.total_space) * 100)
              : 0;
            return (
              <div
                key={h.id}
                className="rounded-lg border border-border p-3 hover:border-teal-400 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${h.is_connected ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                  />
                  <Link to={`/hard-drive/${h.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300 ring-1 ring-inset ring-blue-600/20 px-2.5 py-0.5 text-xs font-medium hover:opacity-80">
                        {h.label}
                      </span>
                      <span className="text-sm text-foreground truncate">
                        {h.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {titles} titles · {formatFileSize(h.total_space)} total ·{" "}
                      {formatFileSize(free)} free
                    </p>
                  </Link>
                  <button
                    onClick={() =>
                      updateHardDrive(h.id, { is_connected: !h.is_connected })
                    }
                    className="text-xs text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap"
                  >
                    {h.is_connected ? "Disconnect" : "Connect"}
                  </button>
                  <button
                    onClick={() => openEditHd(h)}
                    className="p-1.5 text-slate-400 hover:text-teal-500 rounded"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      confirm(`Delete ${h.label}?`) && deleteHardDrive(h.id)
                    }
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {h.total_space > 0 && (
                  <div className="mt-2 ml-5">
                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50/30 dark:bg-rose-500/5 p-6">
        <h3 className="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-2 mb-1">
          <AlertTriangle className="h-5 w-5" /> Danger Zone
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Reset all data back to the original mock seed. This cannot be undone.
        </p>
        <button
          onClick={() =>
            confirm("Reset all data to the original mock seed?") &&
            resetToSeed()
          }
          className="inline-flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 px-4 py-2 text-sm font-medium hover:bg-rose-100 dark:hover:bg-rose-800/30"
        >
          <RotateCcw className="h-4 w-4" /> Reset to Mock Data
        </button>
      </section>

      {editingHd && (
        <Modal
          title={editingHd === "new" ? "Add Hard Drive" : "Edit Hard Drive"}
          onClose={() => setEditingHd(null)}
        >
          <form onSubmit={submitHd} className="space-y-4">
            <Field label="Label">
              <input
                value={hdForm.label}
                onChange={(e) =>
                  setHdForm({ ...hdForm, label: e.target.value })
                }
                placeholder="HDD3"
                required
                className="input"
              />
            </Field>
            <Field label="Name">
              <input
                value={hdForm.name}
                onChange={(e) => setHdForm({ ...hdForm, name: e.target.value })}
                placeholder="Seagate 8TB"
                required
                className="input"
              />
            </Field>
            <Field label="Total Space (bytes)">
              <input
                type="number"
                value={hdForm.total_space}
                onChange={(e) =>
                  setHdForm({ ...hdForm, total_space: e.target.value })
                }
                placeholder="4000000000000"
                className="input"
              />
            </Field>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-3 text-xs text-slate-500 dark:text-slate-400">
              Auto-calculated:{" "}
              <b className="text-foreground">{formatFileSize(editingUsed)}</b>{" "}
              used ·{" "}
              <b className="text-foreground">{formatFileSize(editingFree)}</b>{" "}
              free
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={hdForm.is_connected}
                onChange={(e) =>
                  setHdForm({ ...hdForm, is_connected: e.target.checked })
                }
                className="rounded"
              />
              Currently connected
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingHd(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-medium"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
