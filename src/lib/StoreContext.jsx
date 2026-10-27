import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { loadDB, saveDB, resetDB, uid, emptyMediaDefaults } from "./store";
import { seedData } from "./seedData";
import { getToken } from "@/api/client";
import {
  mediaApi,
  genreApi,
  tagApi,
  personApi,
  driveApi,
  episodeApi,
  bulkApi,
} from "@/api/endpoints";
import {
  mediaFromApi,
  mediaToApi,
  mediaCoreToApi,
  genreFromApi,
  genreToApi,
  tagFromApi,
  tagToApi,
  personFromApi,
  personToApi,
  driveFromApi,
  driveToApi,
} from "@/api/mappers";

const StoreContext = createContext(null);

// One-time migration for databases persisted before the Tags feature:
// backfill tag_ids arrays and seed the default tag collection.
function migrate(db) {
  let changed = false;
  if (!Array.isArray(db.tags)) {
    db.tags = structuredClone(seedData.tags || []);
    changed = true;
  }
  for (const m of db.media || []) {
    if (!Array.isArray(m.tag_ids)) {
      m.tag_ids = [];
      changed = true;
    }
  }
  return changed ? db : null;
}

const emptyDb = () => ({
  media: [],
  genres: [],
  persons: [],
  hardDrives: [],
  tags: [],
});

export function StoreProvider({ children }) {
  const [db, setDb] = useState(() => {
    const loaded = loadDB();
    return migrate(loaded) || loaded;
  });
  // "local" = localStorage prototype store | "api" = Django DRF backend
  const [mode, setMode] = useState("local");
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const update = useCallback((updater) => {
    setDb((prev) =>
      typeof updater === "function" ? updater(structuredClone(prev)) : updater,
    );
  }, []);

  // Persist to localStorage only in local mode (API mode is server-owned).
  useEffect(() => {
    if (modeRef.current === "local") saveDB(db);
  }, [db, mode]);

  // ---- Hydration: try the DRF backend first, fall back to localStorage ----
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (getToken()) {
        try {
          const [media, genres, tags, persons, drives] = await Promise.all([
            mediaApi.list(),
            genreApi.list(),
            tagApi.list(),
            personApi.list(),
            driveApi.list(),
          ]);
          if (cancelled) return;
          setDb({
            media: media.map(mediaFromApi),
            genres: genres.map(genreFromApi),
            tags: tags.map(tagFromApi),
            persons: persons.map(personFromApi),
            hardDrives: drives.map(driveFromApi),
          });
          setMode("api");
          setSyncError(null);
          setReady(true);
          return;
        } catch (e) {
          if (cancelled) return;
          setSyncError(e?.message || "Backend unreachable");
        }
      }
      const loaded = loadDB();
      if (!cancelled) {
        setDb(migrate(loaded) || loaded);
        setMode("local");
        setReady(true);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-hydrate whenever the API token appears/disappears (login/logout).
  const prevToken = useRef(getToken());
  useEffect(() => {
    const check = () => {
      const t = getToken();
      if (t !== prevToken.current) {
        prevToken.current = t;
        setMode((m) => m + 0); // force effect re-run below via state tick
        setHydrateTick((x) => x + 1);
      }
    };
    const iv = setInterval(check, 800);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", check);
    };
  }, []);
  const [hydrateTick, setHydrateTick] = useState(0);
  useEffect(() => {
    if (hydrateTick === 0) return; // initial run handled above
    let cancelled = false;
    async function hydrate() {
      if (getToken()) {
        try {
          const [media, genres, tags, persons, drives] = await Promise.all([
            mediaApi.list(),
            genreApi.list(),
            tagApi.list(),
            personApi.list(),
            driveApi.list(),
          ]);
          if (cancelled) return;
          setDb({
            media: media.map(mediaFromApi),
            genres: genres.map(genreFromApi),
            tags: tags.map(tagFromApi),
            persons: persons.map(personFromApi),
            hardDrives: drives.map(driveFromApi),
          });
          setMode("api");
          setSyncError(null);
          return;
        } catch (e) {
          if (cancelled) return;
          setSyncError(e?.message || "Backend unreachable");
        }
      }
      const loaded = loadDB();
      if (!cancelled) {
        setDb(migrate(loaded) || loaded);
        setMode("local");
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [hydrateTick]);

  // ================= Media CRUD =================
  const addMedia = useCallback(
    async (media) => {
      if (modeRef.current === "api") {
        const created = await mediaApi.create(mediaToApi(media));
        const item = mediaFromApi(created);
        update((d) => {
          d.media.unshift(item);
          return d;
        });
        return item;
      }
      const item = { id: uid("m"), ...media };
      update((d) => {
        d.media.unshift(item);
        return d;
      });
      return item;
    },
    [update],
  );

  const updateMedia = useCallback(
    async (id, patch) => {
      if (modeRef.current === "api") {
        const hasRelations =
          patch.seasons || patch.files || patch.cast || patch.crew;
        const payload = hasRelations
          ? mediaToApi({ ...(patch.id ? patch : { id, ...patch }), ...patch })
          : mediaCoreToApi(patch);
        const updated = await mediaApi.update(id, payload);
        const item = mediaFromApi(updated);
        update((d) => {
          const i = d.media.findIndex((m) => m.id === String(id));
          if (i >= 0) d.media[i] = item;
          return d;
        });
        return item;
      }
      update((d) => {
        const i = d.media.findIndex((m) => m.id === id);
        if (i >= 0) d.media[i] = { ...d.media[i], ...patch };
        return d;
      });
    },
    [update],
  );

  const deleteMedia = useCallback(
    async (id) => {
      if (modeRef.current === "api") {
        await mediaApi.remove(id);
      }
      update((d) => {
        d.media = d.media.filter((m) => m.id !== String(id));
        return d;
      });
    },
    [update],
  );

  const setEpisodeStatus = useCallback(
    async (mediaId, episodeId, status) => {
      if (modeRef.current === "api") {
        await episodeApi.toggle(episodeId, status);
        // Refresh just this item so season/series rollups stay authoritative.
        try {
          const fresh = mediaFromApi(await mediaApi.get(mediaId));
          update((d) => {
            const i = d.media.findIndex((m) => m.id === String(mediaId));
            if (i >= 0) d.media[i] = fresh;
            return d;
          });
          return;
        } catch {
          /* fall through to optimistic update */
        }
      }
      update((d) => {
        const m = d.media.find((x) => x.id === mediaId);
        if (!m || !m.seasons) return d;
        for (const s of m.seasons) {
          const ep = (s.episodes || []).find((e) => e.id === episodeId);
          if (ep) {
            ep.watch_status = status;
            break;
          }
        }
        return d;
      });
    },
    [update],
  );

  // ================= Genre CRUD =================
  const addGenre = useCallback(
    async (g) => {
      if (modeRef.current === "api") {
        const item = genreFromApi(await genreApi.create(genreToApi(g)));
        update((d) => {
          d.genres.push(item);
          return d;
        });
        return item;
      }
      const item = { id: uid("g"), ...g };
      update((d) => {
        d.genres.push(item);
        return d;
      });
      return item;
    },
    [update],
  );
  const updateGenre = useCallback(
    async (id, patch) => {
      if (modeRef.current === "api") {
        const item = genreFromApi(await genreApi.update(id, genreToApi(patch)));
        update((d) => {
          const i = d.genres.findIndex((x) => x.id === String(id));
          if (i >= 0) d.genres[i] = { ...d.genres[i], ...item };
          return d;
        });
        return;
      }
      update((d) => {
        const i = d.genres.findIndex((x) => x.id === id);
        if (i >= 0) d.genres[i] = { ...d.genres[i], ...patch };
        return d;
      });
    },
    [update],
  );
  const deleteGenre = useCallback(
    async (id) => {
      if (modeRef.current === "api") {
        try {
          await genreApi.remove(id);
        } catch {
          /* still drop locally so UI stays consistent on stale deletes */
        }
      }
      update((d) => {
        d.genres = d.genres.filter(
          (x) => x.id !== String(id) && x.parent_genre_id !== String(id),
        );
        d.media = d.media.map((m) => ({
          ...m,
          genre_ids: (m.genre_ids || []).filter((gid) => gid !== String(id)),
        }));
        return d;
      });
    },
    [update],
  );

  // ================= Person CRUD =================
  const addPerson = useCallback(
    async (p) => {
      if (modeRef.current === "api") {
        const item = personFromApi(await personApi.create(personToApi(p)));
        update((d) => {
          d.persons.push(item);
          return d;
        });
        return item;
      }
      const item = { id: uid("p"), ...p };
      update((d) => {
        d.persons.push(item);
        return d;
      });
      return item;
    },
    [update],
  );
  const updatePerson = useCallback(
    async (id, patch) => {
      if (modeRef.current === "api") {
        const item = personFromApi(
          await personApi.update(id, personToApi(patch)),
        );
        update((d) => {
          const i = d.persons.findIndex((x) => x.id === String(id));
          if (i >= 0) d.persons[i] = { ...d.persons[i], ...item };
          return d;
        });
        return;
      }
      update((d) => {
        const i = d.persons.findIndex((x) => x.id === id);
        if (i >= 0) d.persons[i] = { ...d.persons[i], ...patch };
        return d;
      });
    },
    [update],
  );
  const deletePerson = useCallback(
    async (id) => {
      if (modeRef.current === "api") {
        try {
          await personApi.remove(id);
        } catch {
          /* ignore stale deletes */
        }
      }
      update((d) => {
        d.persons = d.persons.filter((x) => x.id !== String(id));
        d.media = d.media.map((m) => ({
          ...m,
          cast: (m.cast || []).filter((c) => c.person_id !== String(id)),
          crew: (m.crew || []).filter((c) => c.person_id !== String(id)),
        }));
        return d;
      });
    },
    [update],
  );

  // ================= Hard drive CRUD =================
  const addHardDrive = useCallback(
    async (h) => {
      if (modeRef.current === "api") {
        const item = driveFromApi(await driveApi.create(driveToApi(h)));
        update((d) => {
          d.hardDrives.push(item);
          return d;
        });
        return item;
      }
      const item = { id: uid("hd"), ...h };
      update((d) => {
        d.hardDrives.push(item);
        return d;
      });
      return item;
    },
    [update],
  );
  const updateHardDrive = useCallback(
    async (id, patch) => {
      if (modeRef.current === "api") {
        const item = driveFromApi(await driveApi.update(id, driveToApi(patch)));
        update((d) => {
          const i = d.hardDrives.findIndex((x) => x.id === String(id));
          if (i >= 0) d.hardDrives[i] = { ...d.hardDrives[i], ...item };
          return d;
        });
        return;
      }
      update((d) => {
        const i = d.hardDrives.findIndex((x) => x.id === id);
        if (i >= 0) d.hardDrives[i] = { ...d.hardDrives[i], ...patch };
        return d;
      });
    },
    [update],
  );
  const deleteHardDrive = useCallback(
    async (id) => {
      if (modeRef.current === "api") {
        try {
          await driveApi.remove(id);
        } catch {
          /* ignore stale deletes */
        }
      }
      update((d) => {
        d.hardDrives = d.hardDrives.filter((x) => x.id !== String(id));
        return d;
      });
    },
    [update],
  );

  // ================= Tag CRUD =================
  const addTag = useCallback(
    async (t) => {
      if (modeRef.current === "api") {
        const item = tagFromApi(await tagApi.create(tagToApi(t)));
        update((d) => {
          d.tags.push(item);
          return d;
        });
        return item;
      }
      const item = { id: uid("t"), ...t };
      update((d) => {
        d.tags.push(item);
        return d;
      });
      return item;
    },
    [update],
  );
  const updateTag = useCallback(
    async (id, patch) => {
      if (modeRef.current === "api") {
        const item = tagFromApi(await tagApi.update(id, tagToApi(patch)));
        update((d) => {
          const i = d.tags.findIndex((x) => x.id === String(id));
          if (i >= 0) d.tags[i] = { ...d.tags[i], ...item };
          return d;
        });
        return;
      }
      update((d) => {
        const i = d.tags.findIndex((x) => x.id === id);
        if (i >= 0) d.tags[i] = { ...d.tags[i], ...patch };
        return d;
      });
    },
    [update],
  );
  const deleteTag = useCallback(
    async (id) => {
      if (modeRef.current === "api") {
        try {
          await tagApi.remove(id);
        } catch {
          /* ignore stale deletes */
        }
      }
      update((d) => {
        d.tags = d.tags.filter((x) => x.id !== String(id));
        d.media = d.media.map((m) => ({
          ...m,
          tag_ids: (m.tag_ids || []).filter((tid) => tid !== String(id)),
        }));
        return d;
      });
    },
    [update],
  );
  const bulkAddTags = useCallback(
    async (mediaIds, tagIds) => {
      if (modeRef.current === "api") {
        await mediaApi.bulkAddTags(mediaIds, tagIds.map(Number));
      }
      update((d) => {
        d.media = d.media.map((m) =>
          mediaIds.includes(m.id)
            ? {
                ...m,
                tag_ids: [...new Set([...(m.tag_ids || []), ...tagIds])],
              }
            : m,
        );
        return d;
      });
    },
    [update],
  );

  // Bulk genre move/delete used by Catalog selection toolbar
  const bulkDeleteMedia = useCallback(
    async (ids) => {
      if (modeRef.current === "api") {
        await mediaApi.bulkDelete(ids);
      }
      update((d) => {
        d.media = d.media.filter((m) => !ids.includes(m.id));
        return d;
      });
    },
    [update],
  );
  const bulkAddGenres = useCallback(
    async (ids, genreIds) => {
      if (modeRef.current === "api") {
        await mediaApi.bulkAddGenres(ids, genreIds.map(Number));
      }
      update((d) => {
        d.media = d.media.map((m) =>
          ids.includes(m.id)
            ? {
                ...m,
                genre_ids: [...new Set([...(m.genre_ids || []), ...genreIds])],
              }
            : m,
        );
        return d;
      });
    },
    [update],
  );
  const bulkMoveFiles = useCallback(
    async (ids, hardDriveId) => {
      if (modeRef.current === "api") {
        await mediaApi.bulkMoveFiles(ids, Number(hardDriveId));
      }
      update((d) => {
        d.media = d.media.map((m) =>
          ids.includes(m.id)
            ? {
                ...m,
                files: (m.files || []).map((f) => ({
                  ...f,
                  hard_drive_id: String(hardDriveId),
                })),
              }
            : m,
        );
        return d;
      });
    },
    [update],
  );

  const toggleWatch = useCallback(
    async (id) => {
      if (modeRef.current === "api") {
        const item = mediaFromApi(await mediaApi.toggleWatch(id));
        update((d) => {
          const i = d.media.findIndex((m) => m.id === String(id));
          if (i >= 0) d.media[i] = item;
          return d;
        });
        return item;
      }
      let toggled = null;
      update((d) => {
        const m = d.media.find((x) => x.id === id);
        if (m) {
          m.watch_status =
            m.watch_status === "watched" ? "unwatched" : "watched";
          toggled = m;
        }
        return d;
      });
      return toggled;
    },
    [update],
  );

  const setWatchlist = useCallback(
    async (id, context) => {
      if (modeRef.current === "api") {
        const item = mediaFromApi(await mediaApi.setWatchlist(id, context));
        update((d) => {
          const i = d.media.findIndex((m) => m.id === String(id));
          if (i >= 0) d.media[i] = item;
          return d;
        });
        return item;
      }
      let patched = null;
      update((d) => {
        const m = d.media.find((x) => x.id === id);
        if (m) {
          m.watchlist_context = context;
          m.watchlist_added_at =
            context && context !== "none" ? new Date().toISOString() : null;
          patched = m;
        }
        return d;
      });
      return patched;
    },
    [update],
  );

  // ================= Reset / import / bulk import =================
  const resetToSeed = useCallback(() => {
    resetDB();
    setDb(structuredClone(seedData));
    setMode("local");
  }, []);

  const importData = useCallback((data) => {
    if (data && typeof data === "object") {
      setDb((prev) => {
        const next = { ...emptyDb(), ...structuredClone(seedData), ...data };
        return migrate(next) || next;
      });
      setMode("local");
    }
  }, []);

  // Merge a list of parsed rows into the catalog.
  // mode: "create" | "skip" | "update" (on imdb_id / title+year duplicates)
  const bulkImportMedia = useCallback(
    async (rows, mode = "create") => {
      if (modeRef.current === "api") {
        const res = await bulkApi.import(rows, mode);
        // Pull the affected items back from the server.
        try {
          const media = await mediaApi.list();
          update((d) => ({ ...d, media: media.map(mediaFromApi) }));
        } catch {
          /* keep optimistic counts if refresh fails */
        }
        return {
          created: res.created ?? 0,
          updated: res.updated ?? 0,
          skipped: res.skipped ?? 0,
          total: res.total ?? rows.length,
        };
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      update((d) => {
        for (const row of rows) {
          const normTitle = (row.title_english || "").toLowerCase().trim();
          const dupIdx = d.media.findIndex(
            (m) =>
              (row.imdb_id && m.imdb_id === row.imdb_id) ||
              (normTitle &&
                m.title_english?.toLowerCase().trim() === normTitle &&
                (row.release_year == null ||
                  m.release_year === Number(row.release_year))),
          );
          if (dupIdx >= 0) {
            if (mode === "update") {
              d.media[dupIdx] = {
                ...d.media[dupIdx],
                ...row,
                id: d.media[dupIdx].id,
              };
              updated++;
            } else {
              skipped++;
            }
          } else {
            d.media.unshift({
              id: uid("m"),
              files: [],
              seasons: [],
              ...emptyMediaDefaults(),
              ...row,
            });
            created++;
          }
        }
        return d;
      });
      return { created, updated, skipped, total: rows.length };
    },
    [update],
  );

  const value = {
    db,
    mode,
    ready,
    syncError,
    addMedia,
    updateMedia,
    deleteMedia,
    setEpisodeStatus,
    toggleWatch,
    setWatchlist,
    addGenre,
    updateGenre,
    deleteGenre,
    addPerson,
    updatePerson,
    deletePerson,
    addHardDrive,
    updateHardDrive,
    deleteHardDrive,
    addTag,
    updateTag,
    deleteTag,
    bulkAddTags,
    bulkDeleteMedia,
    bulkAddGenres,
    bulkMoveFiles,
    bulkImportMedia,
    resetToSeed,
    importData,
  };

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
