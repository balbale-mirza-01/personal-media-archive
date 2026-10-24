import React, { useState } from "react";
import { X, Plus, Trash2, Film } from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { uid, fullName } from "@/lib/store";
import { Field } from "@/pages/Genres";
import { cn } from "@/lib/utils";

const PARENT_CATEGORIES = [
  "Sex & Nudity",
  "Violence & Gore",
  "Profanity",
  "Alcohol, Drugs & Smoking",
  "Frightening & Intense Scenes",
];
const STATUSES = ["watched", "unwatched", "watching", "missing"];
const CONTEXTS = [
  { v: "alone", l: "Alone" },
  { v: "with_wife", l: "With Wife" },
  { v: "family_with_kids", l: "Family with Kids" },
];

function emptyMedia() {
  return {
    type: "movie",
    imdb_id: "",
    title_english: "",
    title_original: "",
    release_year: "",
    end_year: "",
    imdb_rating: "",
    imdb_votes: "",
    personal_rating: 0,
    runtime: "",
    languages: "",
    countries: "",
    aspect_ratio: "2.39:1",
    mpa_rating: "",
    plot_summary: "",
    genre_ids: [],
    tag_ids: [],
    watch_status: "unwatched",
    watchlist_context: "alone",
    notes: "",
    parents_guide_notes: {},
    cast: [],
    crew: [],
    files: [],
    seasons: [],
  };
}

export function MediaFormModal({ media, onClose }) {
  const { db, addMedia, updateMedia } = useStore();
  const [form, setForm] = useState(() => {
    const base = media ? structuredClone(media) : emptyMedia();
    if (Array.isArray(base.languages))
      base.languages = base.languages.join(", ");
    if (Array.isArray(base.countries))
      base.countries = base.countries.join(", ");
    if (!base.parents_guide_notes) base.parents_guide_notes = {};
    if (!base.cast) base.cast = [];
    if (!base.crew) base.crew = [];
    if (!base.files) base.files = [];
    if (!base.seasons) base.seasons = [];
    if (!base.genre_ids) base.genre_ids = [];
    if (!base.tag_ids) base.tag_ids = [];
    return base;
  });
  const isEdit = !!media;

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const toggleGenre = (gid) =>
    setForm((p) => ({
      ...p,
      genre_ids: p.genre_ids.includes(gid)
        ? p.genre_ids.filter((x) => x !== gid)
        : [...p.genre_ids, gid],
    }));
  const toggleTag = (tid) =>
    setForm((p) => ({
      ...p,
      tag_ids: p.tag_ids.includes(tid)
        ? p.tag_ids.filter((x) => x !== tid)
        : [...p.tag_ids, tid],
    }));

  // Files
  const addFile = () =>
    setForm((p) => ({
      ...p,
      files: [
        ...p.files,
        {
          id: uid("f"),
          hard_drive_id: db.hardDrives[0]?.id || "",
          file_path: "",
          file_size: 0,
          is_multi_part: false,
          part_number: p.files.length + 1,
          version_tag: "",
        },
      ],
    }));
  const updateFile = (id, patch) =>
    setForm((p) => ({
      ...p,
      files: p.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  const removeFile = (id) =>
    setForm((p) => ({ ...p, files: p.files.filter((f) => f.id !== id) }));

  // Cast / Crew
  const addCast = () =>
    setForm((p) => ({
      ...p,
      cast: [
        ...p.cast,
        { person_id: db.persons[0]?.id || "", role: "", role_type: "actor" },
      ],
    }));
  const updateCast = (i, patch) =>
    setForm((p) => ({
      ...p,
      cast: p.cast.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));
  const removeCast = (i) =>
    setForm((p) => ({ ...p, cast: p.cast.filter((_, idx) => idx !== i) }));
  const addCrew = () =>
    setForm((p) => ({
      ...p,
      crew: [
        ...p.crew,
        { person_id: db.persons[0]?.id || "", role: "", role_type: "director" },
      ],
    }));
  const updateCrew = (i, patch) =>
    setForm((p) => ({
      ...p,
      crew: p.crew.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));
  const removeCrew = (i) =>
    setForm((p) => ({ ...p, crew: p.crew.filter((_, idx) => idx !== i) }));

  // Seasons / Episodes
  const addSeason = () =>
    setForm((p) => ({
      ...p,
      seasons: [
        ...p.seasons,
        {
          id: uid("s"),
          number: p.seasons.length + 1,
          title: `Season ${p.seasons.length + 1}`,
          imdb_id: "",
          release_year: "",
          episodes: [],
        },
      ],
    }));
  const updateSeason = (id, patch) =>
    setForm((p) => ({
      ...p,
      seasons: p.seasons.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  const removeSeason = (id) =>
    setForm((p) => ({ ...p, seasons: p.seasons.filter((s) => s.id !== id) }));
  const addEpisode = (sid) =>
    setForm((p) => ({
      ...p,
      seasons: p.seasons.map((s) => {
        if (s.id !== sid) return s;
        const n = (s.episodes || []).length + 1;
        return {
          ...s,
          episodes: [
            ...s.episodes,
            {
              id: uid("e"),
              number: n,
              title: `Episode ${n}`,
              imdb_id: "",
              imdb_rating: "",
              runtime: "",
              watch_status: "unwatched",
            },
          ],
        };
      }),
    }));
  const updateEpisode = (sid, eid, patch) =>
    setForm((p) => ({
      ...p,
      seasons: p.seasons.map((s) =>
        s.id !== sid
          ? s
          : {
              ...s,
              episodes: s.episodes.map((e) =>
                e.id === eid ? { ...e, ...patch } : e,
              ),
            },
      ),
    }));
  const removeEpisode = (sid, eid) =>
    setForm((p) => ({
      ...p,
      seasons: p.seasons.map((s) =>
        s.id !== sid
          ? s
          : { ...s, episodes: s.episodes.filter((e) => e.id !== eid) },
      ),
    }));

  const submit = (e) => {
    e.preventDefault();
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const payload = {
      ...form,
      release_year: num(form.release_year),
      end_year: form.type === "series" ? num(form.end_year) : null,
      imdb_rating: num(form.imdb_rating),
      imdb_votes: num(form.imdb_votes),
      personal_rating: num(form.personal_rating) || 0,
      runtime: num(form.runtime),
      languages: form.languages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      countries: form.countries
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      seasons: form.type === "series" ? form.seasons : [],
      files: form.files.map((f) => ({
        ...f,
        file_size: Number(f.file_size) || 0,
      })),
    };
    if (!payload.imdb_id)
      payload.imdb_id = `tt${Math.floor(Math.random() * 9000000 + 1000000)}`;
    if (isEdit) updateMedia(media.id, payload);
    else addMedia(payload);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto scrollbar-thin rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border bg-card">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            {isEdit ? (
              <>
                <Film className="h-5 w-5 text-teal-500" /> Edit Media
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-teal-500" /> Add Media
              </>
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-6">
          <Section title="Basics">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  value={form.type}
                  onChange={(e) => set("type", e.target.value)}
                  className="input"
                >
                  <option value="movie">Movie</option>
                  <option value="series">TV Series</option>
                </select>
              </Field>
              <Field label="IMDb ID">
                <input
                  value={form.imdb_id}
                  onChange={(e) => set("imdb_id", e.target.value)}
                  placeholder="tt#######"
                  className="input font-mono"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title (English)">
                <input
                  value={form.title_english}
                  onChange={(e) => set("title_english", e.target.value)}
                  required
                  className="input"
                />
              </Field>
              <Field label="Title (Original)">
                <input
                  value={form.title_original}
                  onChange={(e) => set("title_original", e.target.value)}
                  className="input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Release Year">
                <input
                  type="number"
                  value={form.release_year}
                  onChange={(e) => set("release_year", e.target.value)}
                  className="input"
                />
              </Field>
              {form.type === "series" && (
                <Field label="End Year">
                  <input
                    type="number"
                    value={form.end_year}
                    onChange={(e) => set("end_year", e.target.value)}
                    className="input"
                  />
                </Field>
              )}
              <Field label="Runtime (min)">
                <input
                  type="number"
                  value={form.runtime}
                  onChange={(e) => set("runtime", e.target.value)}
                  className="input"
                />
              </Field>
            </div>
            <Field label="Plot Summary">
              <textarea
                value={form.plot_summary}
                onChange={(e) => set("plot_summary", e.target.value)}
                rows={3}
                className="input"
              />
            </Field>
          </Section>

          <Section title="Ratings & Classification">
            <div className="grid grid-cols-3 gap-3">
              <Field label="IMDb Rating">
                <input
                  type="number"
                  step="0.1"
                  value={form.imdb_rating}
                  onChange={(e) => set("imdb_rating", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="IMDb Votes">
                <input
                  type="number"
                  value={form.imdb_votes}
                  onChange={(e) => set("imdb_votes", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Personal Rating (0-10)">
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={form.personal_rating}
                  onChange={(e) => set("personal_rating", e.target.value)}
                  className="input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="MPA Rating">
                <input
                  value={form.mpa_rating}
                  onChange={(e) => set("mpa_rating", e.target.value)}
                  placeholder="PG-13"
                  className="input"
                />
              </Field>
              <Field label="Aspect Ratio">
                <input
                  value={form.aspect_ratio}
                  onChange={(e) => set("aspect_ratio", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Watch Status">
                <select
                  value={form.watch_status}
                  onChange={(e) => set("watch_status", e.target.value)}
                  className="input"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Watchlist Context">
              <select
                value={form.watchlist_context}
                onChange={(e) => set("watchlist_context", e.target.value)}
                className="input"
              >
                {CONTEXTS.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.l}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Languages (comma-separated)">
                <input
                  value={form.languages}
                  onChange={(e) => set("languages", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Countries (comma-separated)">
                <input
                  value={form.countries}
                  onChange={(e) => set("countries", e.target.value)}
                  className="input"
                />
              </Field>
            </div>
          </Section>

          <Section title="Genres">
            <div className="flex flex-wrap gap-2">
              {db.genres.map((g) => {
                const active = form.genre_ids.includes(g.id);
                return (
                  <button
                    type="button"
                    key={g.id}
                    onClick={() => toggleGenre(g.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                      active
                        ? "bg-teal-600 text-white ring-teal-600"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300 ring-slate-300 dark:ring-slate-600 hover:ring-teal-400",
                      g.genre_type === "sub" && "ml-4",
                    )}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Tags">
            <div className="flex flex-wrap gap-2">
              {db.tags.map((t) => {
                const active = form.tag_ids.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                      active
                        ? "bg-teal-600 text-white ring-teal-600"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300 ring-slate-300 dark:ring-slate-600 hover:ring-teal-400",
                    )}
                  >
                    #{t.name}
                  </button>
                );
              })}
              {db.tags.length === 0 && (
                <p className="text-xs text-slate-400">
                  No tags yet — create some in Settings.
                </p>
              )}
            </div>
          </Section>

          <Section title="Parents Guide">
            <div className="space-y-2">
              {PARENT_CATEGORIES.map((cat) => (
                <Field key={cat} label={cat}>
                  <input
                    value={form.parents_guide_notes[cat] || ""}
                    onChange={(e) =>
                      set("parents_guide_notes", {
                        ...form.parents_guide_notes,
                        [cat]: e.target.value,
                      })
                    }
                    placeholder="e.g. Mild — …"
                    className="input"
                  />
                </Field>
              ))}
            </div>
          </Section>

          <Section title="Cast & Crew">
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Cast
              </p>
              {form.cast.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={c.person_id}
                    onChange={(e) =>
                      updateCast(i, { person_id: e.target.value })
                    }
                    className="input flex-1"
                  >
                    {db.persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {fullName(p)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={c.role}
                    onChange={(e) => updateCast(i, { role: e.target.value })}
                    placeholder="Role"
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeCast(i)}
                    className="p-2 text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addCast}
                className="inline-flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add cast member
              </button>
            </div>
            <div className="space-y-2 mt-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Crew
              </p>
              {form.crew.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={c.person_id}
                    onChange={(e) =>
                      updateCrew(i, { person_id: e.target.value })
                    }
                    className="input flex-1"
                  >
                    {db.persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {fullName(p)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={c.role}
                    onChange={(e) => updateCrew(i, { role: e.target.value })}
                    placeholder="Role"
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeCrew(i)}
                    className="p-2 text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addCrew}
                className="inline-flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add crew member
              </button>
            </div>
          </Section>

          <Section title="Physical Files">
            <div className="space-y-2">
              {form.files.map((f) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      value={f.file_path}
                      onChange={(e) =>
                        updateFile(f.id, { file_path: e.target.value })
                      }
                      placeholder="File path"
                      className="input flex-1 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="p-2 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={f.hard_drive_id}
                      onChange={(e) =>
                        updateFile(f.id, { hard_drive_id: e.target.value })
                      }
                      className="input"
                    >
                      {db.hardDrives.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={f.version_tag}
                      onChange={(e) =>
                        updateFile(f.id, { version_tag: e.target.value })
                      }
                      placeholder="1080p BluRay"
                      className="input"
                    />
                    <input
                      type="number"
                      value={f.file_size}
                      onChange={(e) =>
                        updateFile(f.id, { file_size: e.target.value })
                      }
                      placeholder="Size (bytes)"
                      className="input"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={!!f.is_multi_part}
                      onChange={(e) =>
                        updateFile(f.id, { is_multi_part: e.target.checked })
                      }
                      className="rounded"
                    />{" "}
                    Multi-part file
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={addFile}
                className="inline-flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add file
              </button>
            </div>
          </Section>

          {form.type === "series" && (
            <Section title="Seasons & Episodes">
              <div className="space-y-3">
                {form.seasons.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex gap-2 items-end">
                      <Field label="Season #">
                        <input
                          type="number"
                          value={s.number}
                          onChange={(e) =>
                            updateSeason(s.id, {
                              number: Number(e.target.value),
                            })
                          }
                          className="input w-20"
                        />
                      </Field>
                      <Field label="Title">
                        <input
                          value={s.title}
                          onChange={(e) =>
                            updateSeason(s.id, { title: e.target.value })
                          }
                          className="input flex-1"
                        />
                      </Field>
                      <Field label="Year">
                        <input
                          type="number"
                          value={s.release_year}
                          onChange={(e) =>
                            updateSeason(s.id, { release_year: e.target.value })
                          }
                          className="input w-24"
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => removeSeason(s.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 mb-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 space-y-2 pl-3 border-l-2 border-teal-200 dark:border-teal-800">
                      {(s.episodes || []).map((ep) => (
                        <div key={ep.id} className="flex gap-2 items-end">
                          <Field label="Ep #">
                            <input
                              type="number"
                              value={ep.number}
                              onChange={(e) =>
                                updateEpisode(s.id, ep.id, {
                                  number: Number(e.target.value),
                                })
                              }
                              className="input w-16"
                            />
                          </Field>
                          <Field label="Title">
                            <input
                              value={ep.title}
                              onChange={(e) =>
                                updateEpisode(s.id, ep.id, {
                                  title: e.target.value,
                                })
                              }
                              className="input flex-1"
                            />
                          </Field>
                          <Field label="Rating">
                            <input
                              type="number"
                              step="0.1"
                              value={ep.imdb_rating}
                              onChange={(e) =>
                                updateEpisode(s.id, ep.id, {
                                  imdb_rating: e.target.value,
                                })
                              }
                              className="input w-20"
                            />
                          </Field>
                          <Field label="Runtime">
                            <input
                              type="number"
                              value={ep.runtime}
                              onChange={(e) =>
                                updateEpisode(s.id, ep.id, {
                                  runtime: e.target.value,
                                })
                              }
                              className="input w-20"
                            />
                          </Field>
                          <button
                            type="button"
                            onClick={() => removeEpisode(s.id, ep.id)}
                            className="p-2 text-slate-400 hover:text-rose-500 mb-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addEpisode(s.id)}
                        className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Add episode
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSeason}
                  className="inline-flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add season
                </button>
              </div>
            </Section>
          )}

          <Section title="Personal Notes">
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                className="input"
              />
            </Field>
          </Section>

          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-card pb-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 text-sm font-medium"
            >
              {isEdit ? "Save Changes" : "Add Media"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </h4>
      {children}
    </div>
  );
}
