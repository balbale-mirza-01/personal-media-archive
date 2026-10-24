# Repository notes

This is a self-hosted React + Vite + Tailwind frontend for the Media KArchive
Management System. It has been decoupled from any hosted platform SDKs.

- `src/lib/store.js`: localStorage-backed data layer (will be replaced by the
  Django REST Framework API client).
- `src/lib/AuthContext.jsx` + `src/lib/demoAuth.js`: demo login (admin/user),
  to be replaced by DRF token auth.
- `src/lib/ThemeContext.jsx`: light/dark mode with localStorage persistence.
- Run locally with `npm install && npm run dev`.
- Do not reintroduce hosted-platform SDKs, analytics plugins, or branding;
  this project must remain fully self-hostable.
