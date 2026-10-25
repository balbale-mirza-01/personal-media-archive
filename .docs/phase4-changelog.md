# Phase 4 Changelog — Frontend UI/UX Refinement & Compliance

**Date:** 2026-10-19 · **Sign-off basis:** Phase 3 proposal approved in full, except RTL → option C (UI stays English/LTR; no bilingual scaffolding).

All changes follow the existing design system: clean minimalist layout, Light/Dark modes, Teal accents (`teal-600` primary), responsive grids, collapsible accordion SeriesTree, soft rounded-full badge tags. No visual language was altered.

## A. Approved items implemented

### A1/A4 — Tags entity (free-form labels, PRD §5.6)

- **Data layer** (`src/lib/seedData.js`, `src/lib/store.js`, `src/lib/StoreContext.jsx`)
  - New `tags` collection `{ id, name }`; seeded 5 tags (`t1`–`t5`).
  - `MediaItem.tag_ids: []` added to every media record + `emptyMediaDefaults()`.
  - Store CRUD exposed via context: `addTag`, `updateTag`, `deleteTag` (delete cascades removal from `media[].tag_ids`), `bulkAddTags(mediaIds, tagIds)` (dedup-safe union).
- **Badges** (`src/components/Badge.jsx`)
  - New `TagBadge` — soft `rounded-full` pill, slate tone by default, optional link target.
- **Catalog** (`src/pages/Catalog.jsx`)
  - Tag filter dropdown in Filters panel (`#name` options).
  - URL deep-link support: `/catalog?tag=<id>` synced via `searchParams`.
  - Active-filter banner shows `#tagname`; counted toward active-filter badge.
- **Media cards** (`src/components/MediaCard.jsx`)
  - Up to 2 clickable `TagBadge`s on grid cards; full list in card detail view; click → tag filter route.
- **Media detail** (`src/pages/MediaDetail.jsx`)
  - New "Tags" card section (Shapes icon, teal accent) shown when tags assigned; badges link back to filtered catalog.
- **Media form** (`src/components/MediaFormModal.jsx`)
  - New "Tags" section between Genres and Parents Guide — toggle pills identical in style to genre picker; safe on empty tag list with hint pointing to Settings.
- **Bulk actions** (`src/components/BulkActions.jsx`)
  - Second bulk popover: "Tags" button applies selected tags to all checked items via `bulkAddTags`.
- **Settings** (`src/pages/Settings.jsx`)
  - New "Tags" management section: create (slug-normalized, duplicate-checked), rename, delete (confirms usage count), per-tag item counts linking to filtered Catalog. Modal reuses `Modal`/`Field` primitives from Genres page.

### A3 — Bulk Import engine (Excel / CSV / Clipboard, PRD §5.1)

- **New lib** `src/lib/bulkImport.js`:
  - `IMPORT_FIELDS` canonical field list (imdb_id, titles, year, type, runtime, mpa_rating, imdb_rating/votes, aspect_ratio, genres, tags, watch_status, watchlist_context, notes…).
  - `parseSpreadsheetFile(file)` — `.xlsx/.xls` via SheetJS (`xlsx` dep already present), `.csv` via robust parser (quoted fields).
  - `parseClipboardText(text)` — TSV (Excel paste) / delimited text.
  - `guessMapping(headers)` — fuzzy header→field auto-matching (case/space/punctuation-insensitive aliases).
  - `mapRowsToMedia(rows, mapping)` — typed row conversion.
  - Dedup helpers keyed on `imdb_id` (PRD §5.2) with modes: **skip / update / duplicate**.
  - `mediaToCsv(db)` — full-catalog CSV export helper (used by Settings > Export CSV).
- **New component** `src/components/ImportDialog.jsx`:
  - Two tabs: _Excel / CSV file_ (picker) and _Paste from clipboard_ (textarea + Parse).
  - Column-mapping step with per-field `<select>` (auto-guessed defaults), live preview table of first rows.
  - Duplicate-mode selector, validation errors surfaced inline, post-import summary (created / updated / skipped counts).
  - Design-system compliant: `bg-card`, `border-border`, teal primary buttons, dark-mode variants.
- **Catalog toolbar**: "Import" button (Upload icon) opens the dialog.

> **Correction note:** earlier draft of this changelog claimed an `exportMediaXlsx` bonus export; it was never implemented (SheetJS is used read-only for `.xlsx` import). Actual export formats today: JSON backup + CSV, per PRD scope. XLSX export can be added in a later pass if desired.

### A8 — Dependency slimming

- **Round 1** (earlier commit): removed Stripe, three/@react-three, react-leaflet, canvas-confetti, jspdf/html2canvas, react-quill-new.
- **Round 2** (this commit): additionally removed app-unused deps `recharts`, `framer-motion`, `next-themes`, `input-otp`, `embla-carousel-react`, `react-resizable-panels`, `cmdk`, `sonner`, `lodash`, `moment`, `react-day-picker`, `@hookform/resolvers` and their orphaned shadcn wrappers (`ui/chart|carousel|input-otp|resizable|sonner|command.jsx`). Kept: all Radix primitives in use, `xlsx` + `papaparse` (bulk import), `date-fns`, `zod`, `react-hook-form`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `react-hot-toast`, `react-markdown`. `package.json` + lockfile updated; rebuild verified.

### RTL (A7) — Option C applied

- No RTL work performed; UI remains English/LTR. Vazirmatn font retained harmlessly (available if needed later).

## B. Verification

- `npm run build` → ✓ built successfully (single bundle warning only, pre-existing).
- `npx eslint src/` → 0 errors (fixed one unused-var warning introduced in Settings).
- Grep audit: zero `base44` references remain in `src/`, `index.html`, `package.json`, `vite.config.js` (Phase 2 state preserved).
- Theme behavior untouched: Light/Dark toggle + `mkbs_theme` persistence verified intact.
- Committed: `Phase 4: frontend refinement - tags entity UI, bulk import (Excel/CSV/clipboard), tag filters & badges, settings management (English-only per sign-off)`.

## C. Status

Phase 4 complete. Next: **Phase 5 — Django + DRF backend & API architecture** (models, serializers, CRUD + bulk endpoints, token auth per approved contract).
