import React, { useState } from "react";
import { Trash2, Tag, HardDrive, X, Shapes } from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { Modal, Field } from "@/pages/Genres";
import { cn } from "@/lib/utils";

export function BulkActions({ selectedIds, onClear }) {
  const { db, deleteMedia, updateMedia, bulkAddTags } = useStore();
  const [tagOpen, setTagOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagSet, setTagSet] = useState(new Set());
  const [labelSet, setLabelSet] = useState(new Set());
  const [moveHd, setMoveHd] = useState("");
  const count = selectedIds.size;
  if (!count) return null;

  const ids = Array.from(selectedIds);

  const handleDelete = () => {
    if (
      confirm(
        `Delete ${count} selected item${count > 1 ? "s" : ""}? This cannot be undone.`,
      )
    ) {
      ids.forEach((id) => deleteMedia(id));
      onClear();
    }
  };

  const applyTag = () => {
    const toAdd = Array.from(tagSet);
    ids.forEach((id) => {
      const m = db.media.find((x) => x.id === id);
      if (m)
        updateMedia(id, {
          genre_ids: Array.from(new Set([...(m.genre_ids || []), ...toAdd])),
        });
    });
    setTagOpen(false);
    setTagSet(new Set());
    onClear();
  };

  const applyLabels = () => {
    bulkAddTags(ids, Array.from(labelSet));
    setLabelOpen(false);
    setLabelSet(new Set());
    onClear();
  };

  const toggleLabel = (tid) =>
    setLabelSet((p) => {
      const n = new Set(p);
      n.has(tid) ? n.delete(tid) : n.add(tid);
      return n;
    });

  const applyMove = () => {
    if (!moveHd) return;
    ids.forEach((id) => {
      const m = db.media.find((x) => x.id === id);
      if (m && m.files)
        updateMedia(id, {
          files: m.files.map((f) => ({ ...f, hard_drive_id: moveHd })),
        });
    });
    setMoveOpen(false);
    setMoveHd("");
    onClear();
  };

  const toggleTag = (gid) =>
    setTagSet((p) => {
      const n = new Set(p);
      n.has(gid) ? n.delete(gid) : n.add(gid);
      return n;
    });

  return (
    <>
      <div className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card shadow-lg px-4 py-3">
        <span className="text-sm font-medium text-foreground">
          {count} selected
        </span>
        <div className="h-5 w-px bg-border mx-1" />
        <button
          onClick={() => setTagOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:border-teal-400"
        >
          <Tag className="h-3.5 w-3.5" /> Genres
        </button>
        <button
          onClick={() => setLabelOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:border-teal-400"
        >
          <Shapes className="h-3.5 w-3.5" /> Tags
        </button>
        <button
          onClick={() => setMoveOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:border-teal-400"
        >
          <HardDrive className="h-3.5 w-3.5" /> Move
        </button>
        <button
          onClick={handleDelete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-800/30"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-foreground ml-auto"
        >
          <X className="h-4 w-4" /> Clear
        </button>
      </div>

      {tagOpen && (
        <Modal
          title={`Tag ${count} item${count > 1 ? "s" : ""}`}
          onClose={() => setTagOpen(false)}
        >
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Add genres to all selected titles.
          </p>
          <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto scrollbar-thin">
            {db.genres.map((g) => {
              const active = tagSet.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleTag(g.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                    active
                      ? "bg-teal-600 text-white ring-teal-600"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300 ring-slate-300 dark:ring-slate-600 hover:ring-teal-400",
                  )}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setTagOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={applyTag}
              disabled={tagSet.size === 0}
              className="rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
            >
              Apply
            </button>
          </div>
        </Modal>
      )}

      {labelOpen && (
        <Modal
          title={`Tag ${count} item${count > 1 ? "s" : ""}`}
          onClose={() => setLabelOpen(false)}
        >
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Add free-form tags to all selected titles.
          </p>
          <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto scrollbar-thin">
            {db.tags.map((t) => {
              const active = labelSet.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleLabel(t.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                    active
                      ? "bg-teal-600 text-white ring-teal-600"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300 ring-slate-300 dark:ring-slate-600 hover:ring-teal-400",
                  )}
                >
                  #{t.name}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setLabelOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={applyLabels}
              disabled={labelSet.size === 0}
              className="rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
            >
              Apply
            </button>
          </div>
        </Modal>
      )}

      {moveOpen && (
        <Modal
          title={`Move ${count} item${count > 1 ? "s" : ""}`}
          onClose={() => setMoveOpen(false)}
        >
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Move all files of the selected titles to a hard drive.
          </p>
          <Field label="Destination Hard Drive">
            <select
              value={moveHd}
              onChange={(e) => setMoveHd(e.target.value)}
              className="input"
            >
              <option value="">— Select drive —</option>
              {db.hardDrives.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label} — {h.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setMoveOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={applyMove}
              disabled={!moveHd}
              className="rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
            >
              Move
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
