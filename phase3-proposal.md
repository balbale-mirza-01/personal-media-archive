# Phase 3 — Feature Proposal & API Contract (Awaiting Sign-off)

**Date:** 2026-10-19 · **Status:** ✅ APPROVED (2026-10-19) — all adjustments accepted; RTL resolved with option C (keep English LTR). Phase 4 implemented, see `phase4-changelog.md`.

This document proposes (A) frontend adjustments, (B) the DRF REST API contract, and (C) backend module layout. Nothing here has been implemented yet except this document.

---

## A. Frontend Adjustments

### A1. Adapter-based store swap (zero page churn)

Every page consumes data exclusively through `useStore()` (`src/lib/StoreContext.jsx`, interface: `db, addMedia, updateMedia, deleteMedia, setEpisodeStatus, addGenre/updateGenre/deleteGenre, addPerson/…, addHardDrive/…, resetToSeed, importData`).
**Proposal:** keep that exact interface, but re-implement its internals on top of the new REST client (`src/api/`) with TanStack Query caching + optimistic updates. Pages/components need **no changes** except where new features are added (A3–A5). This also makes an offline "demo mode" toggle trivial (localStorage adapter vs REST adapter, switchable in Settings).

### A2. Auth → DRF token

Replace the demo-local session in `AuthContext` with `POST /api/auth/token/` (admin/user kept, per Phase 2 decision). Login page UI stays identical; adds an error state for invalid credentials.

### A3. Bulk Import (PRD §5.1 — currently only CSV export exists)

New **"Import"** action in the Catalog toolbar opening a 3-tab dialog:

- **File drop/select** (.xlsx / .csv) → parsed client-side (SheetJS), preview table with column-mapping dropdowns, validation report, `POST /api/media/import/`
- **Paste from clipboard** textarea (TSV/CSV rows)
- **Scan folder** button → triggers backend scanner (§C2), shows discovered files, then routes them into the existing IMDb-match flow
  Duplicate detection by `imdb_id` / normalized title+year → per-row skip/update/create choice.

### A4. Tags (PRD §5.6)

New `Tag` entity + many-to-many on MediaItem. UI: soft rounded-full badges (same style as Quality/MPA badges) on cards/detail, tag input with autocomplete in `MediaFormModal`, tag filter chips in Catalog, Tag management in Settings.

### A5. Real scan results & drive capacity

`Scan.jsx`: replace simulated paths with server-scan results (`POST /api/scanner/run/`); show per-drive used/free space computed server-side from actual `MediaFile.file_size`.

### A6. Excel/JSON Backup (PRD §5.7)

Settings page: keep JSON export/import; add **Excel export** (server-generated via `GET /api/backup/xlsx/`) and Excel import reuse of A3 pipeline.

### A7. RTL / Persian localization — DECISION REQUIRED

PRD §2 specifies a right-aligned Persian UI; prototype is English LTR (Vazirmatn font already loaded). Options:

- **(a)** Full Persian RTL now (largest effort, touches every string)
- **(b)** Bilingual toggle later (i18n scaffolding now, strings migrated incrementally) ← _recommended_
- **(c)** Keep English UI (fastest to ship; PRD deviation noted)

### A8. Dependency slimming _(verified: zero imports found in `src/`)_

Propose removing these 8 unused packages: `@stripe/react-stripe-js`, `@stripe/stripe-js`, `three`, `react-leaflet`, `canvas-confetti`, `jspdf`, `html2canvas`, `react-quill-new`. Add `xlsx` (SheetJS) for client-side Excel parsing (A3).

---

## B. REST API Contract (DRF)

Base: `/api/` · Token auth · Pagination `?page=&page_size=` · All list endpoints support `?search=&ordering=`.

| Resource   | Endpoint                                                                                                                                                          | Methods   | Notes                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| Auth       | `/auth/token/`                                                                                                                                                    | POST      | obtain/refresh DRF tokens                                                                          |
| HardDrives | `/hard-drives/`, `/hard-drives/{id}/`                                                                                                                             | CRUD      | `label, name, is_connected, mount_path, total_space, free_space(read)`                             |
| Genres     | `/genres/`, `/genres/{id}/`                                                                                                                                       | CRUD      | `imdb_genre_id(in###), genre_type(main/sub), parent`; tree via `?parent=null`                      |
| Persons    | `/persons/`, `/persons/{id}/`                                                                                                                                     | CRUD      | `imdb_person_id(nm###), roles[], filmography(read)`                                                |
| MediaItems | `/media/`, `/media/{id}/`                                                                                                                                         | CRUD      | filters: `type, watch_status, watchlist_context, genre, person, hard_drive, tag, min_rating, year` |
| MediaFiles | `/media-files/` (+nested `/media/{id}/files/`)                                                                                                                    | CRUD      | `file_path, file_size, part_number, version_tag, hard_drive`                                       |
| Seasons    | `/seasons/?media={id}`                                                                                                                                            | CRUD      | rollup fields read-only                                                                            |
| Episodes   | `/episodes/?season={id}`                                                                                                                                          | CRUD      | PATCH `{watch_status, personal_rating}` → **bottom-up recalculation** of season→series             |
| Tags       | `/tags/`                                                                                                                                                          | CRUD      |                                                                                                    |
| Watchlist  | `/watchlist/?context=alone\|with_wife\|family_with_kids`                                                                                                          | GET/PATCH | convenience view over MediaItem                                                                    |
| Scanner    | `/scanner/run/` POST `{drive_id, path}` · `/scanner/results/{job_id}/` GET                                                                                        |           | async job; returns parsed filename candidates                                                      |
| IMDb       | `/imdb/search/?q=&year=` → candidate list · `/imdb/import/` POST `{imdb_id, media_id?}`                                                                           |           | duplicate check included; scraper fills genres/persons/ratings/parents-guide                       |
| Bulk ops   | `/media/bulk/` PATCH/DELETE `{ids[], changes}` · `/media/import/` POST (xlsx/csv/json) · `/export/csv/` · `/export/xlsx/` · `/backup/export/` · `/backup/import/` |           |                                                                                                    |

**Serializer shapes** will mirror the existing localStorage entities 1:1 (snake_case preserved), so the A1 adapter is mostly URL plumbing.

---

## C. Backend Module Layout (Phase 5/6 preview)

```
backend/
  config/            settings, urls, wsgi
  apps/core/         HardDrive, Genre, Person, Tag, MediaItem, MediaFile models + DRF
  apps/series/       Season, Episode models + bottom-up signal/service
  apps/watchlist/    context views
  apps/scanner/      services.py  – recursive MKV/MP4 walker, filename parser (ported from store.js)
  apps/imdb/         search.py / scrape.py / importer.py  (IMDb candidate search, metadata+Parents Guide extraction)
  apps/bulkimport/   xlsx/csv/clipboard parsers, dedupe engine
  manage.py, requirements.txt
```

---

## D. Sign-off Checklist

Please confirm or amend:

1. **Adapter strategy (A1)** — keep `useStore()` facade, swap internals to REST? _(recommended)_
2. **API contract (B)** — approve endpoint names/shapes above?
3. **Bulk Import UX (A3)** — 3-tab dialog (File / Paste / Scan-folder) approved?
4. **Tags (A4)** — implement now or defer?
5. **RTL decision (A7)** — option (a), (b), or (c)?
6. **Dependency slimming (A8)** — approve removal list?

On your approval I will proceed with Phase 4 (UI refinements under the existing design system), then Phases 5–8.
