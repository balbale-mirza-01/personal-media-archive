import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Film,
  Tv,
  Trash2,
  Pencil,
  Plus,
  ArrowUpDown,
  Bookmark,
} from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { Modal, Field } from "@/pages/Genres";
import { RatingPill } from "@/components/Stars";
import { ContextBadge, StatusBadge, MpaBadge } from "@/components/Badge";
import { cn } from "@/lib/utils";

const CONTEXTS = [
  { value: "all", label: "All" },
  { value: "alone", label: "Alone" },
  { value: "with_wife", label: "With Wife" },
  { value: "family_with_kids", label: "Family" },
];

const SORTS = [
  { value: "added_desc", label: "Newest first" },
  { value: "added_asc", label: "Oldest first" },
  { value: "imdb_desc", label: "IMDb rating ↓" },
  { value: "personal_desc", label: "My rating ↓" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "year_desc", label: "Year ↓" },
];

const CONTEXT_OPTIONS = [
  { value: "alone", label: "Alone" },
  { value: "with_wife", label: "With Wife" },
  { value: "family_with_kids", label: "Family with Kids" },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function Watchlist() {
  const { db, updateMedia } = useStore();
  const [context, setContext] = useState("all");
  const [sort, setSort] = useState("added_desc");
  const [adding, setAdding] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  const onList = useMemo(
    () =>
      db.media.filter(
        (m) => m.watchlist_context && m.watch_status !== "watched",
      ),
    [db.media],
  );

  const items = useMemo(() => {
    let list = onList;
    if (context !== "all")
      list = list.filter((m) => m.watchlist_context === context);
    const sorted = [...list];
    switch (sort) {
      case "added_desc":
        sorted.sort((a, b) =>
          (b.watchlist_added_at || "").localeCompare(
            a.watchlist_added_at || "",
          ),
        );
        break;
      case "added_asc":
        sorted.sort((a, b) =>
          (a.watchlist_added_at || "").localeCompare(
            b.watchlist_added_at || "",
          ),
        );
        break;
      case "imdb_desc":
        sorted.sort((a, b) => (b.imdb_rating || 0) - (a.imdb_rating || 0));
        break;
      case "personal_desc":
        sorted.sort(
          (a, b) => (b.personal_rating || 0) - (a.personal_rating || 0),
        );
        break;
      case "title_asc":
        sorted.sort((a, b) =>
          (a.title_english || "").localeCompare(b.title_english || ""),
        );
        break;
      case "year_desc":
        sorted.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
        break;
      default:
        break;
    }
    return sorted;
  }, [onList, context, sort]);

  const counts = useMemo(
    () => ({
      all: onList.length,
      alone: onList.filter((m) => m.watchlist_context === "alone").length,
      with_wife: onList.filter((m) => m.watchlist_context === "with_wife")
        .length,
      family_with_kids: onList.filter(
        (m) => m.watchlist_context === "family_with_kids",
      ).length,
    }),
    [onList],
  );

  const remove = (m) => {
    if (confirm(`Remove "${m.title_english}" from your watchlist?`)) {
      updateMedia(m.id, { watchlist_context: null, watchlist_added_at: null });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-teal-500" /> My Watchlist
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {items.length} title(s) queued to watch
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-xl border border-border bg-card pl-9 pr-8 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add to Watchlist
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CONTEXTS.map((c) => (
          <button
            key={c.value}
            onClick={() => setContext(c.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors",
              context === c.value
                ? "bg-teal-600 border-teal-600 text-white"
                : "border-border text-slate-600 dark:text-slate-300 hover:border-teal-400",
            )}
          >
            {c.label}{" "}
            <span
              className={cn(
                "ml-1 text-xs",
                context === c.value ? "text-teal-100" : "text-slate-400",
              )}
            >
              {counts[c.value]}
            </span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Bookmark className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 dark:text-slate-500">
            Your watchlist is empty for this filter.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {items.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <Link
                to={`/media/${m.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                  {m.type === "series" ? (
                    <Tv className="h-5 w-5" />
                  ) : (
                    <Film className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate hover:text-teal-600 dark:hover:text-teal-400">
                    {m.title_english}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {m.release_year} · added {m.watchlist_added_at || "—"}
                  </p>
                </div>
              </Link>
              <div className="hidden sm:flex items-center gap-1.5">
                <ContextBadge context={m.watchlist_context} />
                <StatusBadge status={m.watch_status} />
                <MpaBadge mpa={m.mpa_rating} />
              </div>
              <RatingPill
                value={m.imdb_rating}
                className="hidden md:inline-flex"
              />
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditEntry(m)}
                  className="p-1.5 text-slate-400 hover:text-teal-500 rounded"
                  title="Edit entry"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(m)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
                  title="Remove from watchlist"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <AddWatchlistModal onClose={() => setAdding(false)} />}
      {editEntry && (
        <EditEntryModal media={editEntry} onClose={() => setEditEntry(null)} />
      )}
    </div>
  );
}

function AddWatchlistModal({ onClose }) {
  const { db, updateMedia } = useStore();
  const candidates = db.media.filter(
    (m) => !m.watchlist_context || m.watch_status === "watched",
  );
  const [mediaId, setMediaId] = useState(candidates[0]?.id || "");
  const [context, setContext] = useState("alone");
  const [addedAt, setAddedAt] = useState(today());

  const save = () => {
    if (!mediaId) return;
    const m = db.media.find((x) => x.id === mediaId);
    updateMedia(mediaId, {
      watchlist_context: context,
      watchlist_added_at: addedAt,
      watch_status: m.watch_status === "watched" ? "unwatched" : m.watch_status,
    });
    onClose();
  };

  return (
    <Modal title="Add to Watchlist" onClose={onClose}>
      <div className="space-y-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            All titles are already on a watchlist.
          </p>
        ) : (
          <>
            <Field label="Title">
              <select
                value={mediaId}
                onChange={(e) => setMediaId(e.target.value)}
                className="input"
              >
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title_english} ({m.release_year})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Watchlist Context">
              <select
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="input"
              >
                {CONTEXT_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date Added">
              <input
                type="date"
                value={addedAt}
                onChange={(e) => setAddedAt(e.target.value)}
                className="input"
              />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!mediaId}
            className="rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
          >
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditEntryModal({ media, onClose }) {
  const { updateMedia } = useStore();
  const [context, setContext] = useState(media.watchlist_context);
  const [addedAt, setAddedAt] = useState(media.watchlist_added_at || today());
  const [notes, setNotes] = useState(media.notes || "");

  const save = () => {
    updateMedia(media.id, {
      watchlist_context: context,
      watchlist_added_at: addedAt,
      notes,
    });
    onClose();
  };

  return (
    <Modal title="Edit Watchlist Entry" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground">
          {media.title_english}
        </p>
        <Field label="Watchlist Context">
          <select
            value={context}
            onChange={(e) => setContext(e.target.value)}
            className="input"
          >
            {CONTEXT_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date Added">
          <input
            type="date"
            value={addedAt}
            onChange={(e) => setAddedAt(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="input"
            placeholder="Optional notes…"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
