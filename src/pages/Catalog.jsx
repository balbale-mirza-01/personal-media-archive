import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  LayoutGrid,
  Rows3,
  SlidersHorizontal,
  X,
  Plus,
  CheckSquare,
  Upload,
} from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { MediaCard } from "@/components/MediaCard";
import { MediaFormModal } from "@/components/MediaFormModal";
import { ImportDialog } from "@/components/ImportDialog";
import { BulkActions } from "@/components/BulkActions";
import { fullName } from "@/lib/store";
import { cn } from "@/lib/utils";

const STATUSES = ["watched", "unwatched", "watching", "missing"];
const CONTEXTS = [
  { value: "alone", label: "Alone" },
  { value: "with_wife", label: "With Wife" },
  { value: "family_with_kids", label: "Family with Kids" },
];

const ALL_FILTERS = {
  hardDrive: "all",
  status: "all",
  context: "all",
  genre: "all",
  tag: "all",
  type: "all",
  quality: "all",
  subtitle: "all",
  person: "all",
  mpa: "all",
};

function fromParams(sp) {
  return {
    ...ALL_FILTERS,
    type: sp.get("type") || "all",
    hardDrive: sp.get("hdd") || "all",
    status: sp.get("status") || "all",
    context: sp.get("context") || "all",
    genre: sp.get("genre") || "all",
    tag: sp.get("tag") || "all",
    quality: sp.get("quality") || "all",
    mpa: sp.get("mpa") || "all",
    person: sp.get("person") || "all",
  };
}

export default function Catalog() {
  const { db } = useStore();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState("grid");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(() => fromParams(searchParams));
  const [showFilters, setShowFilters] = useState(true);
  const [editing, setEditing] = useState(null); // media object for form, or 'new', or null
  const [importOpen, setImportOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const toggleSelect = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  useEffect(() => {
    setFilters(fromParams(searchParams));
  }, [searchParams]);

  const qualities = useMemo(() => {
    const set = new Set();
    db.media.forEach((m) =>
      (m.files || []).forEach((f) => {
        const q = f.version_tag
          ?.match(/(4K|2160p|1080p|720p|480p|UHD)/i)?.[1]
          ?.toUpperCase();
        if (q) set.add(q);
      }),
    );
    return Array.from(set);
  }, [db.media]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.media.filter((m) => {
      if (q) {
        const hay =
          `${m.title_english} ${m.title_original} ${m.release_year}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.type !== "all" && m.type !== filters.type) return false;
      if (filters.status !== "all" && m.watch_status !== filters.status)
        return false;
      if (filters.context !== "all" && m.watchlist_context !== filters.context)
        return false;
      if (
        filters.genre !== "all" &&
        !(m.genre_ids || []).includes(filters.genre)
      )
        return false;
      if (filters.tag !== "all" && !(m.tag_ids || []).includes(filters.tag))
        return false;
      if (filters.mpa !== "all" && m.mpa_rating !== filters.mpa) return false;
      if (filters.hardDrive !== "all") {
        const onHd = (m.files || []).some(
          (f) => f.hard_drive_id === filters.hardDrive,
        );
        if (!onHd) return false;
      }
      if (filters.quality !== "all") {
        const hasQ = (m.files || []).some((f) =>
          f.version_tag?.toUpperCase().includes(filters.quality),
        );
        if (!hasQ) return false;
      }
      if (filters.person !== "all") {
        const hasPerson =
          (m.cast || []).some((c) => c.person_id === filters.person) ||
          (m.crew || []).some((c) => c.person_id === filters.person);
        if (!hasPerson) return false;
      }
      return true;
    });
  }, [db.media, search, filters]);

  const setF = (key, value) => setFilters((p) => ({ ...p, [key]: value }));
  const activeCount = Object.entries(filters).filter(
    ([k, v]) => k !== "subtitle" && v !== "all",
  ).length;
  const clearFilters = () => setFilters(ALL_FILTERS);

  const activeGenre =
    filters.genre !== "all"
      ? db.genres.find((g) => g.id === filters.genre)
      : null;
  const activeTag =
    filters.tag !== "all"
      ? (db.tags || []).find((t) => t.id === filters.tag)
      : null;
  const activePerson =
    filters.person !== "all"
      ? db.persons.find((p) => p.id === filters.person)
      : null;
  const activeHdd =
    filters.hardDrive !== "all"
      ? db.hardDrives.find((h) => h.id === filters.hardDrive)
      : null;

  return (
    <div className="space-y-5">
      {/* Search + actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or year…"
            className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add Media
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3.5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-teal-400 transition-colors"
            title="Bulk import from Excel / CSV / clipboard"
          >
            <Upload className="h-4 w-4" /> Import
          </button>
          <button
            onClick={() => {
              setSelectMode((s) => !s);
              setSelected(new Set());
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors",
              selectMode
                ? "border-teal-500 bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"
                : "border-border text-slate-600 dark:text-slate-300 hover:border-teal-400",
            )}
          >
            <CheckSquare className="h-4 w-4" /> {selectMode ? "Done" : "Select"}
          </button>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors",
              showFilters || activeCount
                ? "border-teal-400 text-teal-600 dark:text-teal-400"
                : "border-border text-slate-600 dark:text-slate-300 hover:border-teal-400",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 && (
              <span className="ml-0.5 rounded-full bg-teal-600 text-white text-[10px] px-1.5 py-0.5">
                {activeCount}
              </span>
            )}
          </button>
          <div className="flex rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "p-2.5",
                view === "grid"
                  ? "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"
                  : "text-slate-400 hover:text-slate-600",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("table")}
              className={cn(
                "p-2.5",
                view === "table"
                  ? "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"
                  : "text-slate-400 hover:text-slate-600",
              )}
            >
              <Rows3 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Active prefilter banner */}
      {(activeGenre || activePerson || activeHdd || activeTag) && (
        <div className="rounded-lg bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-800/50 px-4 py-2.5 text-sm text-teal-700 dark:text-teal-300">
          Filtering by: {activeGenre && <b>{activeGenre.name}</b>}
          {activeTag && <b>#{activeTag.name}</b>}
          {activePerson && <b>{fullName(activePerson)}</b>}
          {activeHdd && (
            <b>
              {activeHdd.label} — {activeHdd.name}
            </b>
          )}
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Advanced Filters
            </h3>
            {activeCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-500"
              >
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FilterSelect
              label="Type"
              value={filters.type}
              onChange={(v) => setF("type", v)}
              options={[
                { value: "all", label: "All" },
                { value: "movie", label: "Movies" },
                { value: "series", label: "Series" },
              ]}
            />
            <FilterSelect
              label="Hard Drive"
              value={filters.hardDrive}
              onChange={(v) => setF("hardDrive", v)}
              options={[
                { value: "all", label: "All" },
                ...db.hardDrives.map((h) => ({ value: h.id, label: h.label })),
              ]}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => setF("status", v)}
              options={[
                { value: "all", label: "All" },
                ...STATUSES.map((s) => ({
                  value: s,
                  label: s[0].toUpperCase() + s.slice(1),
                })),
              ]}
            />
            <FilterSelect
              label="Watchlist"
              value={filters.context}
              onChange={(v) => setF("context", v)}
              options={[{ value: "all", label: "All" }, ...CONTEXTS]}
            />
            <FilterSelect
              label="Genre"
              value={filters.genre}
              onChange={(v) => setF("genre", v)}
              options={[
                { value: "all", label: "All" },
                ...db.genres.map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
            <FilterSelect
              label="Tag"
              value={filters.tag}
              onChange={(v) => setF("tag", v)}
              options={[
                { value: "all", label: "All" },
                ...(db.tags || []).map((t) => ({
                  value: t.id,
                  label: `#${t.name}`,
                })),
              ]}
            />
            <FilterSelect
              label="Quality"
              value={filters.quality}
              onChange={(v) => setF("quality", v)}
              options={[
                { value: "all", label: "All" },
                ...qualities.map((q) => ({ value: q, label: q })),
              ]}
            />
            <FilterSelect
              label="MPA Rating"
              value={filters.mpa}
              onChange={(v) => setF("mpa", v)}
              options={[
                { value: "all", label: "All" },
                ...Array.from(
                  new Set(db.media.map((m) => m.mpa_rating).filter(Boolean)),
                ).map((m) => ({ value: m, label: m })),
              ]}
            />
            <FilterSelect
              label="Person"
              value={filters.person}
              onChange={(v) => setF("person", v)}
              options={[
                { value: "all", label: "All" },
                ...db.persons.map((p) => ({ value: p.id, label: fullName(p) })),
              ]}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectMode && filtered.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filtered.every((m) => selected.has(m.id))}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? new Set(filtered.map((m) => m.id))
                      : new Set(),
                  )
                }
                className="rounded"
              />
              Select all
            </label>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-foreground">
              {filtered.length}
            </span>{" "}
            of {db.media.length} titles
          </p>
        </div>
        {selectMode && selected.size > 0 && (
          <span className="text-sm font-medium text-teal-600 dark:text-teal-400">
            {selected.size} selected
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-slate-400 dark:text-slate-500">
            No titles match your filters.
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((m) => (
            <MediaCard
              key={m.id}
              media={m}
              hardDrives={db.hardDrives}
              tags={db.tags || []}
              onEdit={setEditing}
              selectMode={selectMode}
              selected={selected}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 dark:bg-slate-800/40 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-4 pr-2 font-medium">Title</th>
                <th className="px-2 font-medium">Year</th>
                <th className="px-2 font-medium">IMDb</th>
                <th className="px-2 font-medium">Quality</th>
                <th className="px-2 font-medium">Drive</th>
                <th className="px-2 font-medium">MPA</th>
                <th className="px-2 font-medium">Status</th>
                <th className="px-2 font-medium">Context</th>
                <th className="py-2.5 pl-2 pr-4 font-medium text-right">
                  Size / Episodes
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <MediaCard
                  key={m.id}
                  media={m}
                  hardDrives={db.hardDrives}
                  tags={db.tags || []}
                  view="table"
                  onEdit={setEditing}
                  selectMode={selectMode}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkActions
        selectedIds={selected}
        onClear={() => setSelected(new Set())}
      />

      {editing && (
        <MediaFormModal
          media={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
