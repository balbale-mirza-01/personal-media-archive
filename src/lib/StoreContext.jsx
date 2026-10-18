import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { loadDB, saveDB, resetDB, uid } from "./store";
import { seedData } from "./seedData";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [db, setDb] = useState(() => loadDB());

  useEffect(() => {
    saveDB(db);
  }, [db]);

  const update = useCallback((updater) => {
    setDb((prev) => {
      const next =
        typeof updater === "function"
          ? updater(structuredClone(prev))
          : updater;
      return next;
    });
  }, []);

  // ---- Media CRUD ----
  const addMedia = useCallback(
    (media) => {
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
    (id, patch) => {
      update((d) => {
        const i = d.media.findIndex((m) => m.id === id);
        if (i >= 0) d.media[i] = { ...d.media[i], ...patch };
        return d;
      });
    },
    [update],
  );

  const deleteMedia = useCallback(
    (id) => {
      update((d) => {
        d.media = d.media.filter((m) => m.id !== id);
        return d;
      });
    },
    [update],
  );

  const setEpisodeStatus = useCallback(
    (mediaId, episodeId, status) => {
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

  // ---- Genre CRUD ----
  const addGenre = useCallback(
    (g) => {
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
    (id, patch) => {
      update((d) => {
        const i = d.genres.findIndex((x) => x.id === id);
        if (i >= 0) d.genres[i] = { ...d.genres[i], ...patch };
        return d;
      });
    },
    [update],
  );
  const deleteGenre = useCallback(
    (id) => {
      update((d) => {
        d.genres = d.genres.filter(
          (x) => x.id !== id && x.parent_genre_id !== id,
        );
        d.media = d.media.map((m) => ({
          ...m,
          genre_ids: (m.genre_ids || []).filter((gid) => gid !== id),
        }));
        return d;
      });
    },
    [update],
  );

  // ---- Person CRUD ----
  const addPerson = useCallback(
    (p) => {
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
    (id, patch) => {
      update((d) => {
        const i = d.persons.findIndex((x) => x.id === id);
        if (i >= 0) d.persons[i] = { ...d.persons[i], ...patch };
        return d;
      });
    },
    [update],
  );
  const deletePerson = useCallback(
    (id) => {
      update((d) => {
        d.persons = d.persons.filter((x) => x.id !== id);
        d.media = d.media.map((m) => ({
          ...m,
          cast: (m.cast || []).filter((c) => c.person_id !== id),
          crew: (m.crew || []).filter((c) => c.person_id !== id),
        }));
        return d;
      });
    },
    [update],
  );

  // ---- Hard drive CRUD ----
  const addHardDrive = useCallback(
    (h) => {
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
    (id, patch) => {
      update((d) => {
        const i = d.hardDrives.findIndex((x) => x.id === id);
        if (i >= 0) d.hardDrives[i] = { ...d.hardDrives[i], ...patch };
        return d;
      });
    },
    [update],
  );
  const deleteHardDrive = useCallback(
    (id) => {
      update((d) => {
        d.hardDrives = d.hardDrives.filter((x) => x.id !== id);
        return d;
      });
    },
    [update],
  );

  const resetToSeed = useCallback(() => {
    resetDB();
    setDb(structuredClone(seedData));
  }, []);

  const importData = useCallback((data) => {
    if (data && typeof data === "object") {
      setDb({ ...structuredClone(seedData), ...data });
    }
  }, []);

  const value = {
    db,
    addMedia,
    updateMedia,
    deleteMedia,
    setEpisodeStatus,
    addGenre,
    updateGenre,
    deleteGenre,
    addPerson,
    updatePerson,
    deletePerson,
    addHardDrive,
    updateHardDrive,
    deleteHardDrive,
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
