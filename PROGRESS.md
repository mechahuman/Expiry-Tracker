# Build Progress Log

Narrative log of what's been done, in order. Machine-readable state lives in `PROJECT_STATE.json` — update both together.

---

## 2026-08-13 — Planning
- Full 12-module roadmap analyzed; risks flagged (OCR complexity, WASM bundle size, Supabase free-tier pause, iOS push limits).
- Per-module Opus 4.8 / Sonnet 5 model guide agreed (see `PROJECT_STATE.json.model_guide`).
- Plan saved to `C:\Users\manav\.claude\plans\development-roadmap-atomic-fountain.md`.
- Working agreements: pause after each module's checklist; lazy-load OpenCV.js/vosk-browser/Tesseract.js from Module 0.

## 2026-08-13 — Module 0 (Project Setup) started
- `PROJECT_STATE.json` and this log created in project root to track build state across sessions.
- Scaffolded Vite + React app (`npm create vite@latest . -- --template react`) via a temp subfolder workaround (create-vite's overwrite prompt needs a TTY).
- Installed core deps: `zustand`, `react-hook-form`, `@supabase/supabase-js`; dev dep `vite-plugin-pwa`.
- Configured `vite.config.js`: VitePWA plugin (`registerType: 'autoUpdate'`, manifest with name/theme/icons), Workbox precache glob. Removed an initial `manualChunks` object config that broke the build under Vite 8's rolldown bundler — dynamic `import()` alone is enough to keep Modules 5/6's heavy WASM libs out of the app-shell bundle.
- Generated placeholder 192x192/512x512 PNG icons (solid teal, no design tool available) — flagged to replace with real branding later.
- Created `src/lib/supabaseClient.js` (throws clearly if env keys are missing) and `.env.local` / `.env.local.example` (keys currently blank).
- Replaced Vite's default `App.jsx` with a minimal Supabase connectivity check using `supabase.auth.getSession()` (doesn't depend on any table, so it works before Module 1's schema exists).
- `npm run build` verified working (service worker + manifest generated).
- Git repo initialized; initial commit `7e72f76` ("Module 0: scaffold Vite+React PWA, Supabase client, PWA manifest") — `.env.local` correctly excluded via `*.local` in `.gitignore`.
- Deploy target chosen: **Vercel**.
- User created Supabase project (`rrrgwvndhubaxoxeklex`), shared Project URL + anon public key + a new-format publishable key. Used the anon public (JWT) key in `.env.local` to match `supabaseClient.js`'s expected `VITE_SUPABASE_ANON_KEY`.
- Verified the project is live: `curl .../auth/v1/health` with the anon key returned HTTP 200.
- Started the Vite dev server locally (`npm run dev`, port 5173) — starts clean, no build errors, `curl localhost:5173` returns HTTP 200.
- User switched deploy plan to GitHub-connected auto-deploy (instead of Vercel CLI). Created empty GitHub repo `mechahuman/Expiry-Tracker`.
- Renamed local branch `master` → `main`, added `origin` remote, pushed initial commit — `main` now tracks `origin/main`.
- User connected the GitHub repo on Vercel dashboard, added env vars, deployed. Live at **https://expiry-tracker-mu.vercel.app/**.
- Verified via curl: root page, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png` all return HTTP 200; manifest content correct.
- User confirmed in-browser: "Supabase status: connected" showing, and install/"Add to Home Screen" works on their phone.
- **MODULE 0 COMPLETE.** All Done-when checklist items passed: app loads on deployed HTTPS URL (desktop + phone), Supabase connection confirmed, PWA installable.

---

## Module 1 — DB Schema (not started)
Next up. Recommended model per plan: **Opus 4.8** (RLS policies are security-critical — a mistake here silently leaks data across users).
