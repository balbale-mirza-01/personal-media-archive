# Media KArchive Management System — Frontend

Self-hosted React + Vite + Tailwind CSS frontend for the Media KArchive
Management System (see `PRD.md`). Currently runs against a local demo data
layer (`src/lib/store.js`, persisted in `localStorage`) and will be connected
to the Django REST Framework backend in later phases.

## Requirements

- Node.js 20+
- npm 10+

## Getting started

```bash
npm install
npm run dev      # start the Vite dev server (http://localhost:5173)
npm run build    # production build into ./dist
npm run preview  # serve the production build locally
npm run lint     # ESLint
```

## Demo authentication

The app is protected by a lightweight demo login (no real credentials):

- **Admin User** — full access, manage all archive data
- **Regular User** — browse and manage the catalog

Sessions are stored in `localStorage` under `mkbs_demo_user` and replaced by
DRF token auth once the backend is integrated.

## Project layout

```
src/
  pages/        # Route pages (Home, Catalog, Scan, Genres, Persons, ...)
  components/   # Feature components + shadcn/ui primitives
  lib/          # Store (localStorage data layer), auth, theme, seed data
```
