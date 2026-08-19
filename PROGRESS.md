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

## 2026-08-13 — Module 1 (DB Schema) started
- Wrote `supabase/schema.sql`: `profiles`, `categories` (seeded), `inventory_items`, `badges`, `user_badges` tables matching the roadmap exactly, plus RLS enabled + `auth.uid()`-based policies on `profiles`/`inventory_items`/`user_badges`. `categories`/`badges` intentionally left without RLS (shared reference data). `user_badges` has no update/delete policy on purpose — badges are append-only from the client.
- Wrote `supabase/test_rls.sql`: manual verification script — create 2 test auth users, seed one inventory row each, impersonate each via `request.jwt.claims` + `set local role authenticated`, confirm each only sees their own row.
- I don't have DB credentials (only the anon key, not the DB password or a Management API token) so I can't run this SQL myself — user ran `schema.sql` then `test_rls.sql` in the Supabase SQL Editor.
- RLS isolation confirmed both directions: impersonating test-a returned only "Test A milk", impersonating test-b returned only "Test B chips". Test inventory rows cleaned up; the two test auth users left in place (harmless).
- **MODULE 1 COMPLETE.**

---

## 2026-08-19 — Module 1 hardening audit (Opus 4.8)
Re-reviewed the Module 1 schema before building on it. Seven issues found; all fixes written to `supabase/002_hardening.sql` (idempotent, run after `schema.sql`).

**Critical — verified live, not theoretical.** `categories` and `badges` were created without RLS on the reasoning "it's read-only reference data." That reasoning was wrong: Supabase exposes every public-schema table through PostgREST and grants the `anon`/`authenticated` roles write privileges by default, so RLS-off means nothing denies a write. Tested against the real project using only the anon key (which is public — it ships inside the frontend bundle): `POST /categories` → **201**, `DELETE /categories` → **204**, `POST /badges` → **201**. Any visitor to the deployed site could have renamed or deleted every user's categories and badges. `inventory_items` correctly rejected the same attack (`42501`), so the RLS we tested in Module 1 was fine — the gap was in the two tables we'd decided *didn't need* it. Audit rows cleaned up, tables verified back to original state.

Also fixed:
- **`timestamp` → `timestamptz`** on `created_at`/`used_at`/`earned_at`. `now()` is timestamptz and was being silently flattened to UTC; in an IST app built entirely around date deadlines that's an off-by-one-day bug waiting near every midnight. `expiry_date` stays `date` deliberately — a printed best-before is a calendar date, not an instant.
- **`ON DELETE CASCADE`** on the `auth.users` FKs — previously NO ACTION, so deleting a user with any inventory row would have failed outright. `category_id` → `SET NULL` instead (retiring a category shouldn't delete someone's food).
- **Profile creation moved to a DB trigger** (`handle_new_user`, AFTER INSERT on `auth.users`). Module 2 was going to insert the profile row client-side after `signUp()`; that orphans the account if anything fails between the two calls, and it doesn't work at all for Google OAuth, which returns from the redirect already authenticated with no "just signed up" moment to hook. **→ Module 2 must NOT insert into `profiles`; the trigger owns it.**
- **Indexes** on `(user_id, status)`, partial `(expiry_date) where status='active'`, and `user_badges(user_id)` — RLS appends `user_id = auth.uid()` to every query, so these columns are in the WHERE clause of every read the app makes, and Postgres doesn't index FKs automatically.
- **`(select auth.uid())`** wrapping in policies so it's evaluated once per query rather than once per row. Made `WITH CHECK` explicit on UPDATE policies too — worth noting this was *not* a hole before, Postgres falls back to the `USING` expression when `WITH CHECK` is omitted.
- **`check (quantity > 0)`** — Module 3's form validation is UX, not enforcement.

**Deferred (design decision, revisit at Module 9):** `profiles.points` and `user_badges` are still directly writable by their owner, so points and badges can be self-awarded from devtools, bypassing the client-side criteria logic. Fixable via `revoke update(points)` + SECURITY DEFINER award functions. Left alone for now — Module 9's logic doesn't exist yet.

**Verified after user ran `002_hardening.sql`** — re-ran the identical anon-key attack:
- `POST /categories` → `42501` denied (was 201)
- `POST /badges` → `42501` denied (was 201)
- `DELETE /categories?name=eq.Snacks` → 204 but **zero rows affected**; Snacks still present. (With RLS on and no DELETE policy, no rows match, so it's a silent no-op — PostgREST reports 204 regardless. Not a leak.)
- Reads still return all 5 categories.

`supabase/verify_hardening.sql` added to check the parts the public API can't see (timestamptz, FK cascades, signup trigger, indexes, profile coverage, quantity constraint) — every row should read PASS.

---

## Module 2 — Auth & Onboarding (not started)
Next up. Recommended model per plan: **Sonnet 5** (well-trodden Supabase Auth pattern — signup/login/OAuth, onboarding carousel, route guards).
**Carry-in from the audit:** do not write the `profiles` insert into the signup flow — the `on_auth_user_created` trigger already handles it for every sign-up path including OAuth.
