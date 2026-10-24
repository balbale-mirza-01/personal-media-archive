import React, { useState, useMemo } from "react";
import { Users, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { Badge } from "@/components/Badge";
import { Modal, Field } from "./Genres";
import { fullName } from "@/lib/store";
import { useNavigate } from "react-router-dom";

export default function Persons() {
  const { db, addPerson, updatePerson, deletePerson } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  function emptyForm() {
    return {
      imdb_person_id: "",
      first_name: "",
      last_name: "",
      roles: [],
      birth_date: "",
      death_date: "",
      nationality: "",
      biography: "",
    };
  }

  const allRoles = useMemo(
    () => Array.from(new Set(db.persons.flatMap((p) => p.roles || []))).sort(),
    [db.persons],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return db.persons.filter((p) => {
      if (roleFilter !== "all" && !(p.roles || []).includes(roleFilter))
        return false;
      if (!q) return true;
      return (
        fullName(p).toLowerCase().includes(q) ||
        p.imdb_person_id?.toLowerCase().includes(q)
      );
    });
  }, [db.persons, search, roleFilter]);

  const mediaFor = (personId) =>
    db.media.filter(
      (m) =>
        (m.cast || []).some((c) => c.person_id === personId) ||
        (m.crew || []).some((c) => c.person_id === personId),
    );

  const openNew = () => {
    setForm(emptyForm());
    setEditing("new");
  };
  const openEdit = (p) => {
    setForm({ ...p, roles: p.roles || [] });
    setEditing(p.id);
  };
  const close = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      imdb_person_id:
        form.imdb_person_id ||
        `nm${Math.floor(Math.random() * 9000000 + 1000000)}`,
      roles:
        typeof form.roles === "string"
          ? form.roles
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean)
          : form.roles,
    };
    if (editing === "new") addPerson(payload);
    else updatePerson(editing, payload);
    close();
  };

  const remove = (p) => {
    if (
      confirm(
        `Delete ${fullName(p)}? They will be removed from all linked media.`,
      )
    )
      deletePerson(p.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or IMDb ID…"
            className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        >
          <option value="all">All Roles</option>
          {allRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Add Person
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => {
          const titles = mediaFor(p.id);
          return (
            <div
              key={p.id}
              onClick={() => navigate(`/person/${p.id}`)}
              className="rounded-xl border border-border bg-card p-4 hover:border-teal-400 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-teal-200 dark:from-teal-500/20 dark:to-teal-600/20 text-teal-600 dark:text-teal-400 font-semibold">
                  {p.first_name?.[0]}
                  {p.last_name?.[0]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {fullName(p)}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                    {p.imdb_person_id}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(p.roles || []).map((r) => (
                      <Badge key={r} tone="teal">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              {p.nationality && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {p.nationality} · {p.birth_date}
                </p>
              )}
              {p.biography && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {p.biography}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {titles.length} title{titles.length !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(p);
                    }}
                    className="p-1.5 text-slate-400 hover:text-teal-500 rounded"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Users className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 dark:text-slate-500">
            No persons found.
          </p>
        </div>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? "Add Person" : "Edit Person"}
          onClose={close}
        >
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name">
                <input
                  value={form.first_name}
                  onChange={(e) =>
                    setForm({ ...form, first_name: e.target.value })
                  }
                  required
                  className="input"
                />
              </Field>
              <Field label="Last Name">
                <input
                  value={form.last_name}
                  onChange={(e) =>
                    setForm({ ...form, last_name: e.target.value })
                  }
                  className="input"
                />
              </Field>
            </div>
            <Field label="IMDb Person ID">
              <input
                value={form.imdb_person_id}
                onChange={(e) =>
                  setForm({ ...form, imdb_person_id: e.target.value })
                }
                placeholder="nm#######"
                className="input font-mono"
              />
            </Field>
            <Field label="Roles (comma-separated)">
              <input
                value={
                  Array.isArray(form.roles) ? form.roles.join(", ") : form.roles
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    roles: e.target.value
                      .split(",")
                      .map((r) => r.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Director, Actor"
                className="input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Birth Date">
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) =>
                    setForm({ ...form, birth_date: e.target.value })
                  }
                  className="input"
                />
              </Field>
              <Field label="Nationality">
                <input
                  value={form.nationality}
                  onChange={(e) =>
                    setForm({ ...form, nationality: e.target.value })
                  }
                  className="input"
                />
              </Field>
            </div>
            <Field label="Biography">
              <textarea
                value={form.biography}
                onChange={(e) =>
                  setForm({ ...form, biography: e.target.value })
                }
                rows={3}
                className="input"
              />
            </Field>
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
