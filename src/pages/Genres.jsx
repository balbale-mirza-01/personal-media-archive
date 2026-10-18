import React, { useState, useMemo } from "react";
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  Search,
} from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { Badge } from "@/components/Badge";
import { cn } from "@/lib/utils";

export default function Genres() {
  const { db, addGenre, updateGenre, deleteGenre } = useStore();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // {id} or 'new'
  const [form, setForm] = useState(emptyForm());

  function emptyForm() {
    return {
      imdb_genre_id: "",
      name: "",
      description: "",
      genre_type: "main",
      parent_genre_id: "",
    };
  }

  const tree = useMemo(() => {
    const mains = db.genres.filter((g) => g.genre_type === "main");
    const q = search.toLowerCase();
    return mains
      .map((m) => ({
        ...m,
        children: db.genres.filter((g) => g.parent_genre_id === m.id),
      }))
      .filter(
        (g) =>
          !q ||
          g.name.toLowerCase().includes(q) ||
          g.children.some((c) => c.name.toLowerCase().includes(q)),
      );
  }, [db.genres, search]);

  const mediaCount = (genreId) =>
    db.media.filter((m) => (m.genre_ids || []).includes(genreId)).length;

  const openNew = () => {
    setForm(emptyForm());
    setEditing("new");
  };
  const openEdit = (g) => {
    setForm({ ...g, parent_genre_id: g.parent_genre_id || "" });
    setEditing(g.id);
  };
  const close = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      imdb_genre_id:
        form.imdb_genre_id ||
        `in${Math.floor(Math.random() * 9000000 + 1000000)}`,
      name: form.name,
      description: form.description,
      genre_type: form.genre_type,
      parent_genre_id:
        form.genre_type === "sub" ? form.parent_genre_id || null : null,
    };
    if (editing === "new") addGenre(payload);
    else updateGenre(editing, payload);
    close();
  };

  const remove = (g) => {
    if (confirm(`Delete genre "${g.name}"? Subgenres will also be removed.`))
      deleteGenre(g.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search genres…"
            className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Add Genre
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-slate-50 dark:bg-slate-800/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Tags className="h-4 w-4 text-teal-500" /> Genre Tree
          </h3>
        </div>
        <div className="divide-y divide-border">
          {tree.length === 0 && (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">
              No genres found.
            </p>
          )}
          {tree.map((main) => (
            <GenreNode
              key={main.id}
              genre={main}
              mediaCount={mediaCount(main.id)}
              onEdit={openEdit}
              onDelete={remove}
            >
              {main.children.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 pl-12 pr-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                >
                  <span className="text-slate-300 dark:text-slate-600">└</span>
                  <Badge tone="slate" to={`/genre/${sub.id}`}>
                    {sub.name}
                  </Badge>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                    {sub.imdb_genre_id}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {mediaCount(sub.id)} titles
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => openEdit(sub)}
                      className="p-1.5 text-slate-400 hover:text-teal-500 rounded"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(sub)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </GenreNode>
          ))}
        </div>
      </div>

      {editing && (
        <Modal
          title={editing === "new" ? "Add Genre" : "Edit Genre"}
          onClose={close}
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="input"
              />
            </Field>
            <Field label="IMDb Genre ID">
              <input
                value={form.imdb_genre_id}
                onChange={(e) =>
                  setForm({ ...form, imdb_genre_id: e.target.value })
                }
                placeholder="in#######"
                className="input font-mono"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
                className="input"
              />
            </Field>
            <Field label="Type">
              <select
                value={form.genre_type}
                onChange={(e) =>
                  setForm({ ...form, genre_type: e.target.value })
                }
                className="input"
              >
                <option value="main">Main Genre</option>
                <option value="sub">Subgenre</option>
              </select>
            </Field>
            {form.genre_type === "sub" && (
              <Field label="Parent Genre">
                <select
                  value={form.parent_genre_id}
                  onChange={(e) =>
                    setForm({ ...form, parent_genre_id: e.target.value })
                  }
                  className="input"
                >
                  <option value="">— Select parent —</option>
                  {db.genres
                    .filter((g) => g.genre_type === "main")
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
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

function GenreNode({ genre, mediaCount, onEdit, onDelete, children }) {
  const [open, setOpen] = useState(true);
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30">
        <button
          onClick={() => hasChildren && setOpen((o) => !o)}
          className="text-slate-400"
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>
        <Badge tone="teal" to={`/genre/${genre.id}`}>
          {genre.name}
        </Badge>
        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
          {genre.imdb_genre_id}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {mediaCount} titles
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => onEdit(genre)}
            className="p-1.5 text-slate-400 hover:text-teal-500 rounded"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(genre)}
            className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {open && children}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
