# Base44 Sanitization & Decoupling — Change Log (Phase 2)

**Date:** 2026-10-19
**Scope:** Remove all Base44 platform SDKs, plugins, wrappers, and branding from the frontend; make the project fully self-hosted. The demo login page (admin/user accounts) is **kept**, re-implemented on a local session layer instead of the hosted auth SDK.

---

## 1. Dependencies & build configuration

| File                | Change                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`      | Removed dependencies `@base44/sdk` and `@base44/vite-plugin`. Renamed package `base44-app` → `media-karchive`.                                                                                                                                                                                                                             |
| `vite.config.js`    | Removed the `base44()` plugin entirely (analyticsTracker, visualEditAgent, hmrNotifier, navigationNotifier, legacySDKImports). Config now contains only `@vitejs/plugin-react` plus an explicit `resolve.alias` for `@ → ./src` (this mapping was previously injected implicitly by the Base44 plugin, so it had to be declared manually). |
| `.npmrc`            | Kept the supply-chain `min-release-age=7` policy but removed the `min-release-age-exclude=@base44/*` scope exemption (no longer relevant).                                                                                                                                                                                                 |
| `package-lock.json` | Regenerated via `npm install`; `@base44/*` packages pruned from `node_modules` (41 packages removed).                                                                                                                                                                                                                                      |
| `pnpm-lock.yaml`    | Deleted — stale duplicate lockfile that still referenced `@base44/*` entries. npm is the single package manager for this repo.                                                                                                                                                                                                             |

## 2. Files deleted (Base44 SDK / hosted-platform code)

| File                                                      | Reason                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/api/base44Client.js`                                 | Created the hosted SDK client (`createClient` from `@base44/sdk`).                                                       |
| `src/lib/app-params.js`                                   | Read `VITE_BASE44_APP_ID` / `VITE_BASE44_FUNCTIONS_VERSION` / `VITE_BASE44_APP_BASE_URL` env vars and SDK access tokens. |
| `src/lib/authReturnTo.js`                                 | Only consumed by the hosted Register flow; its comments referenced SDK token bootstrap params.                           |
| `src/pages/Register.jsx`                                  | Hosted email/OTP/Google-OAuth registration via `base44.auth.*`.                                                          |
| `src/pages/ForgotPassword.jsx`                            | Hosted password-reset request via `base44.auth.resetPasswordRequest`.                                                    |
| `src/pages/ResetPassword.jsx`                             | Hosted password reset via `base44.auth.resetPassword`.                                                                   |
| `src/pages/OAuthConsent.jsx`                              | Base44 MCP OAuth consent screen (never routed in `App.jsx`).                                                             |
| `src/components/AuthLayout.jsx`                           | Wrapper used exclusively by the deleted hosted-auth pages.                                                               |
| `src/components/GoogleIcon.jsx`                           | Google OAuth button icon for the deleted Register page.                                                                  |
| `src/components/UserNotRegisteredError.jsx`               | Rendered the hosted "user not registered for this app" error state.                                                      |
| `src/components/ui/image-helpers.js`                      | URL rewriting engine for `media.base44.com` hosted image CDN.                                                            |
| `src/components/ui/image.jsx`                             | Base44-responsive `Image` component (unused by any app page).                                                            |
| `src/components/ui/responsive-image.jsx`                  | Emitted `data-base44-image*` attributes for the platform's visual editor.                                                |
| `src/components/ui/use-responsive-image.jsx`              | Listened for the `base44:image-replace` editor event.                                                                    |
| `base44/` (folder: `config.jsonc`, `entities/User.jsonc`) | Platform project config and entity schema.                                                                               |

## 3. Files rewritten / edited

| File                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/AuthContext.jsx`           | Rewritten without the SDK. Same public interface (`AuthProvider`, `useAuth`, `user`, `isAuthenticated`, `isLoadingAuth`, `authError`, `authChecked`, `logout`, `navigateToLogin`) so no consumer broke. Session is now backed purely by the local demo-user store (`localStorage: mkbs_demo_user`). Added `login(user)` action. `isLoadingPublicSettings` (hosted app-settings bootstrap) removed. Comment marks DRF token auth as the Phase 5/7 replacement. |
| `src/components/ProtectedRoute.jsx` | Simplified to check only the local demo session (`getDemoUser()`); removed `checkUserAuth` SDK polling effect and `UserNotRegisteredError` branch. Redirects to `/login` when signed out.                                                                                                                                                                                                                                                                     |
| `src/pages/Login.jsx`               | **Kept exactly as designed** (Admin User / Regular User cards, teal accents, dark-mode styling). Only change: sign-in now calls `login()` from `AuthContext` instead of writing `setDemoUser` directly.                                                                                                                                                                                                                                                       |
| `src/App.jsx`                       | Removed imports/routes for `/register`, `/forgot-password`, `/reset-password` and the `UserNotRegisteredError` handling; removed `isLoadingPublicSettings` gate. `/login` route and `AuthProvider` wiring unchanged.                                                                                                                                                                                                                                          |
| `src/lib/PageNotFound.jsx`          | Removed `base44.auth.me()` query and the admin-only "Ask it to implement it in the chat" hosted-builder note; restyled with the existing slate/teal palette + dark mode.                                                                                                                                                                                                                                                                                      |
| `index.html`                        | Favicon replaced: remote `https://base44.com/logo_v2.svg` → inline SVG data-URI (teal clapperboard). Removed broken `<link rel="manifest" href="/manifest.json">` (file never existed in `public/`). Title/fonts untouched.                                                                                                                                                                                                                                   |
| `README.md`                         | Replaced Base44 CLI instructions (`base44 link/dev/deploy`, dashboard docs links) with plain self-host instructions (`npm install`, `npm run dev/build/preview/lint`) and demo-auth notes.                                                                                                                                                                                                                                                                    |
| `AGENTS.md`                         | Replaced Base44 workflow guidance with neutral repo notes, including a rule against reintroducing hosted-platform SDKs.                                                                                                                                                                                                                                                                                                                                       |
| `.gitignore`                        | Removed the `base44/.app.jsonc` ignore entry (folder no longer exists).                                                                                                                                                                                                                                                                                                                                                                                       |

## 4. Incidental cleanup (lint compliance)

`npm run lint` reported **16 pre-existing unused-import errors** on the original prototype commit (verified via `git stash`). Since a clean lint gate is required for CI, `eslint --fix` was applied (mechanical import removals in `Scan.jsx`, `Catalog.jsx`, `BulkActions.jsx`, `Settings.jsx`, `Persons.jsx`, etc.). No behavior changes.

## 5. What was intentionally preserved

- **Demo login page** at `/login` with both **admin** and **user** accounts (per request), same UI/design system.
- Local data layer (`src/lib/store.js`, `seedData.js`, `StoreContext.jsx`) — mock persistence stays until the Django/DRF backend lands (Phases 5–7).
- Theme system (`ThemeContext.jsx`, light/dark, `mkbs_theme` persistence) — untouched.
- All routes, pages, and components unrelated to the platform SDK.

## 6. Verification results

| Check                                                                   | Result                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grep -rni "base44"` across repo (excl. `node_modules`, `.git`, `dist`) | **0 matches** ✅                                                                                                                                                                                     |
| `@base44/*` in `package.json` / `package-lock.json` / `node_modules`    | **0 references** ✅                                                                                                                                                                                  |
| `npm run build`                                                         | ✅ Production build succeeds (`dist/` emitted, ~410 kB JS)                                                                                                                                           |
| `npm run lint`                                                          | ✅ 0 errors                                                                                                                                                                                          |
| `npm run dev` smoke test                                                | ✅ Dev server on `http://localhost:5173`; index + all rewritten modules (`App.jsx`, `AuthContext.jsx`, `ProtectedRoute.jsx`, `Login.jsx`, `PageNotFound.jsx`, touched pages) transform with HTTP 200 |

## 7. Follow-ups queued for later phases

- Replace `AuthContext` demo session with DRF token authentication (Phase 5/7 contract: `POST /api/auth/token/`).
- Introduce `src/api/client.js` REST service layer to supersede the localStorage store (Phase 7).
- Decision pending (Phase 3): RTL/Persian UI toggle per PRD.
