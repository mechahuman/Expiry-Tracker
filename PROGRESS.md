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
Next up. Recommended model per plan: **Sonnet 5** (well-trodden Supabase Auth pattern — signup/login, onboarding carousel, route guards).

**Decisions made before starting:**
- **Email/password only.** Google OAuth deferred to its own later pass — it needs a Google Cloud project, consent screen, and redirect URIs configured by the user. Login screen should be built so a Google button slots in later without rework.
- **`react-router-dom`** for routing (to install). Real URLs make the "logged-out users can't reach Home by URL" checklist item actually testable, and every module from 3 onward needs its own screen.
- **Email confirmation OFF** during development (Supabase → Auth → Providers → Email → disable "Confirm email"). Added to the launch checklist to re-enable before real users.

**Carry-in from the audit:** do **not** insert the `profiles` row in the signup flow — the `on_auth_user_created` trigger handles it atomically for every signup path. A client-side insert would be redundant and would fail on PK conflict. This supersedes the original roadmap's Module 2 step 3.

## 2026-08-19 — Module 2 (Auth & Onboarding) built
Installed `react-router-dom`. Files added:
- `src/store/authStore.js` — Zustand store: `session`, `loading`, `hasOnboarded` (localStorage-backed), `setSession`, `completeOnboarding`, `signOut`.
- `src/components/ProtectedRoute.jsx` — gates `/home`.
- `src/pages/Onboarding.jsx` — 3 slides, CSS scroll-snap carousel, no library.
- `src/pages/Login.jsx` — React Hook Form, login/signup toggle in one screen.
- `src/pages/Home.jsx` — empty state + logout; reads the user's own `profiles` row.
- `src/App.jsx` — `BrowserRouter`, routes, and the auth bootstrap (`getSession()` then `onAuthStateChange`).
- `src/index.css` — replaced Vite's demo styles (fixed 1126px, purple) with mobile-first tokens on the teal that matches the manifest.
- `vercel.json` — SPA rewrite. Deleted `src/App.css`.

Three decisions worth recording because they're non-obvious:
- **The `loading` flag is load-bearing.** Supabase restores sessions asynchronously, so `ProtectedRoute` must wait for the initial `getSession()` to resolve. Without it, refreshing on `/home` bounces a logged-in user to `/login` before the session arrives.
- **`vercel.json` rewrite is required**, not optional polish. Vite's dev server has an SPA fallback built in, so direct navigation to `/login` works locally and would have 404'd only in production — exactly the kind of bug that shows up after deploy.
- **Home reads the `profiles` row on purpose.** It's not decoration: if that read succeeds, it proves the `on_auth_user_created` trigger fired *and* that RLS lets a user read their own row. If it errors, one of those two is broken.

`npm run lint` clean, `npm run build` succeeds, all four routes serve.

**BLOCKER — email confirmation is still ON.** Tested the real signup API: `POST /auth/v1/signup` created the auth user but returned `confirmation_sent_at` and **no** `access_token`, and the follow-up password login returned HTTP 400. The flow can't complete until it's disabled. (Also learned: Supabase rejects `@example.com` as an invalid address — use a real-looking domain for API tests.)

### Module 2 browser test script (run after disabling email confirmation)
1. `npm run dev` → open the local URL. First visit should land on **Onboarding**.
2. Swipe through the 3 slides, tap **Get started** → lands on **Login**.
3. Tap **Create one**, sign up with any email + 6-char password → should land straight on **Home**.
4. Home footer should read **"Points: 0"** — that's the trigger-created profile row being read back through RLS. If it shows a red "Profile error", the trigger or the RLS policy is wrong.
5. **Refresh the page** → should stay on Home, not bounce to Login. (This is the `loading`-flag behaviour.)
6. Manually type `/home` in the URL bar while logged out → should redirect to Login.
7. Tap **Log out** → back to Login. Type `/home` again → still redirects.
8. Reload the app entirely → should skip Onboarding this time and go straight to Login (localStorage flag).
9. After pushing: repeat steps 6–7 on the **deployed Vercel URL** to confirm the `vercel.json` rewrite works in production.

**MODULE 2 COMPLETE 2026-08-20.** Confirmed by user: signup/login working in-browser after disabling "Confirm email" (screenshot showed logged in as `test-b@example.com`, Home showing "Points: 0"). One gotcha along the way: `test-a@example.com`'s real password is **not** `TestPass123!` — that was only ever an example I suggested when creating it back in Module 1, never confirmed. Don't assume test user passwords in future sessions; mint a fresh one via signup instead when a known password is needed for API testing.

---

## 2026-08-20 — Module 3 (Manual Entry) built

**Architectural call made up front:** Module 7 (Verify Details, not yet built) explicitly reuses "the exact form fields from Module 3" so Voice/OCR can pre-fill them. So the form is `src/components/ItemForm.jsx` — a standalone, reusable component, not inlined into a page. It takes `initialValues` (partial, for Module 7's pre-fill later), `inputMethod` (defaults `'manual'`), and an `onSaved(item)` callback; it's deliberately ignorant of navigation. `src/pages/AddItem.jsx` is the thin page shell at `/add` that owns the Cancel button and decides what happens after save (navigate to `/home` with a flash message) — cancel semantics stay in the page because Module 7's cancel behavior differs ("discard draft, return to capture screen").

Fields: name (required), quantity (required, must be `> 0` — matches the DB's `check (quantity > 0)` from `002_hardening.sql`, not just "non-negative"), unit (static dropdown: pcs/g/kg/ml/l/packs), category (dropdown fetched from `categories`), expiry date (native date input, past dates allowed through with a non-blocking warning per the roadmap's "warn, don't hard-block").

**Refactor while building this:** `.field`/`.form-banner` classes lived in `Login.css`. `ItemForm` needed them too, and relying on `Login.jsx` happening to be imported elsewhere to make them globally available was fragile — would silently break if pages later get code-split with `React.lazy` (plausible, given the lazy-loading pattern already planned for Modules 5/6). Moved them to `index.css` where the other shared elements (`.btn-primary`, `input`) already live. Also extended `input`'s styling to `select`, since this is the first module needing dropdowns.

`npm run lint` and `npm run build` both pass clean.

**Verified end-to-end via the REST API** (signed up a fresh `m3test...@fastmail.com` test user rather than guessing existing passwords, matching the Module 2 lesson above):
1. Valid insert (correct `user_id`, `quantity: 2`, `unit: l`, `input_method: manual`) → **201**, row returned correctly.
2. `quantity: 0` → **400**, rejected by `inventory_items_quantity_positive` — confirms the client-side validation isn't just UX, it mirrors a real DB guard.
3. `input_method: "typed"` (not in `manual`/`voice`/`ocr`) → **400**, rejected by the check constraint.
4. Insert claiming a different user's UUID as `user_id` → **403**, rejected by RLS — confirms Module 1's isolation still holds under Module 3's exact insert shape.
5. Read-back showed only the one row belonging to this user. Test row deleted afterward, confirmed clean.

**Not yet done — needs the user:** the browser test. The API test proves the data layer is correct (RLS + constraints + insert shape all line up), but not that the React form itself renders and behaves correctly (validation messages, the past-date warning, the flash banner on return to Home).

### Module 3 browser test script
1. `npm run dev` → log in → on Home, tap **"Add your first item"**.
2. Try submitting empty → Name and Expiry date should show inline errors; Quantity/Unit have defaults so won't.
3. Enter a name, set quantity to `0` → inline "Must be greater than 0" error, blocked from submitting.
4. Fill everything validly but pick an expiry date **before today** → should show "This date is in the past." but still let you submit.
5. Submit a fully valid item → should land back on **Home** with a banner like `"Amul milk" added`, which fades after ~3 seconds.
6. Refresh Home right after → the banner should **not** reappear (it's cleared from history state, not just hidden).
7. Tap **Cancel** from the Add screen → should return to Home with no banner and nothing saved.

**MODULE 3 COMPLETE 2026-08-20** — user tested on the deployed Vercel URL and confirmed "working perfectly."

---

## 2026-08-20 — Module 4 (Inventory List & Mark as Used) built

The inventory list lives directly on `Home.jsx` rather than a new route — it's the app's main screen, and Home already owned the empty-state placeholder Module 3 left there. Fetch query: `inventory_items` filtered to `user_id` + `status = 'active'` (matches the `(user_id, status)` index from the Module 1 hardening pass), with the category name pulled in via Supabase's embedded-resource select (`category:categories(name)`) rather than a second query — satisfies the roadmap's "filters work without extra network calls" requirement by design, not by caching.

Extracted `src/lib/date.js` (`todayISO()`, `daysUntil()`) out of `ItemForm.jsx`, since `Home.jsx` needed the same local-date logic and copy-pasting it would risk the two drifting apart on a timezone edge case later. Color thresholds match the roadmap exactly: red ≤2 days (also covers already-expired), orange ≤7 days, teal beyond — added `--warning`/`--warning-bg` tokens to `index.css` since orange didn't exist yet (red and teal did).

Filter chips (All / Expiring soon / Expired / one per category actually present) and the search box are pure `useMemo` filtering over the already-fetched list — no network calls per interaction. Mark-as-used does an optimistic local removal from state rather than a refetch.

Added `src/lib/badges.js` — a documented no-op `checkBadgeProgress(userId)` stub, called from both `AddItem.jsx`'s save handler and `Home.jsx`'s mark-used handler. This is the hook point the roadmap calls out under Module 4 for Module 9 to fill in later; the point of adding it now is that Module 9 only needs to implement the function body, not go find where to call it from.

`npm run lint` and `npm run build` both pass clean.

**Verified end-to-end via the REST API** with a fresh test user:
1. Seeded 4 items spanning the thresholds — expired (−3d), urgent (+1d), soon (+5d), fine (+60d) — across 3 categories.
2. Ran the *exact* query `Home.jsx` uses (select + category join + `user_id`/`status` filter + `order by expiry_date`) → correct rows, correct ordering (expired-first), category names joined correctly.
3. Marked one item used (`PATCH status=used, used_at=...`) → succeeds, the item drops out of the active-filtered query but the row itself is preserved (not deleted).
4. An update attempt using only the anon key (no real session) affected **0 rows** — RLS silently filters rather than erroring. First time an UPDATE has actually been tested under RLS (Modules 1–3 only exercised SELECT/INSERT).
5. All test data cleaned up, confirmed empty.

**Not yet done — needs the user:** actually looking at this on a screen. The API test proves the data and query logic are correct, but filter-chip interaction, live search-as-you-type, and whether the color-coded badges read correctly at a glance all need real eyes.

### Module 4 browser test script
1. Add 2–3 items via **"Add your first item"** with different expiry dates (e.g. tomorrow, next week, next month) and different categories.
2. On Home: confirm each item shows a color-coded badge matching its urgency (red/orange/teal) and the right "X days left" / "Expires tomorrow" / "Expired Nd ago" text.
3. Tap the **"Expiring soon"** chip → only items ≤7 days should remain.
4. Tap a **category chip** → only that category's items should remain.
5. Type into the **search box** → list narrows to matching names live, no page reload.
6. Tap **"Mark as used"** on an item → it should disappear from the list immediately.
7. Refresh the page → the used item should stay gone (confirms it's a real DB update, not just local state).

*(Still outstanding — user moved to Module 5 without confirming this one.)*

---

## 2026-08-20 — Module 5 (Voice Input) built, + Module 7's Verify screen brought forward

Three decisions taken before building:
- **Verify screen built properly now** rather than a throwaway handoff. `src/pages/VerifyItem.jsx` is effectively Module 7 for the voice path; when Module 6 lands, Module 7 reduces to pointing OCR at the same screen. Avoids building it twice.
- **vosk-browser deferred.** Its model is a ~50MB download, and among current browsers only Firefox lacks `SpeechRecognition` — Chrome (desktop + Android) and Safari both have it, which covers this PWA's actual install targets. Unsupported browsers get an explicit "not supported here, type it instead" screen. `src/lib/speech.js` is written as an interface vosk can slot behind later with no UI change.
- **Vitest added** so the parser — the genuinely risky part — is verifiable without a microphone.

### The parser, and why the ordering matters
`src/lib/voiceParser.js` turns "two packs of milk expiring 25th August" into `{name: 'Milk', quantity: 2, unit: 'packs', expiry_date: '2026-08-25'}`.

Quantity+unit is matched **first**, and any chrono date hit overlapping that span is discarded. Without that, chrono reads the "two" in "two packs" as *2 o'clock*, swallows the number, and the quantity silently disappears — a wrong-but-plausible result, which is the exact failure mode this module is prone to. There's a regression test named for it.

Two other non-obvious bits: the transcript is lowercased but **never re-spaced** before matching, because collapsing whitespace shifts string indices out of alignment with what chrono sees and corrupts the span arithmetic used to cut the name out. And chrono runs with `forwardDate: true`, since an expiry date is always the *upcoming* 25th of August, not the past one.

Throughout, the roadmap's "blank is safer than wrong" rule holds: anything not confidently extracted stays `null` for the user to fill in on Verify.

**The tests immediately earned their keep.** The bare-number fallback originally matched digits only, so "three bottles" silently dropped the quantity — "bottles" isn't one of the six DB units, so the quantity+unit rule didn't fire either, and the number fell through both paths. Now number words are matched too, with `a`/`an` deliberately excluded from that path (alone they're articles, not counts) while still counting when bound to a real unit, as in "a packet of bread". 11 tests passing.

### Bundle finding worth carrying into Module 6
chrono-node code-split correctly into its own chunk (43kB gzipped; the app shell only grew ~8kB). **But** the Workbox `globPatterns` precaches *every* emitted JS chunk, including lazily-imported ones — so `import()` keeps a library out of the app-shell bundle while the service worker still downloads it at install time. That's a fair trade for chrono (it buys offline voice parsing), but it would completely undo the Module 0 lazy-load decision for Tesseract.js/OpenCV.js. Note left inline in `vite.config.js`; exclude those chunks when Module 6 lands.

`npm run lint`, `npm test` (11 passing), and `npm run build` all clean. All routes serve.

**I cannot verify this one myself** — speech recognition needs a real microphone and a browser, with no headless path. The parser is fully tested; the speech wrapper and mic UI are not.

### Module 5 browser test script
Mic access requires HTTPS, so use the deployed URL (localhost also works).
1. Home → **"Add by voice"** → browser should prompt for mic permission → allow.
2. Tap the mic. It should pulse, and your words should appear live as you speak.
3. Say **"two packs of milk expiring 25th August"** → should land on **Check the details** with Name `Milk`, Quantity `2`, Unit `packs`, Expiry `2026-08-25`, each tagged **detected**.
4. Try a sparser phrase like **"paneer"** → only Name filled, everything else blank (blank, *not* wrongly guessed).
5. Try **"curd expiring tomorrow"** → date should resolve to actual tomorrow.
6. Edit a pre-filled field, then **Save item** → lands on Home with the flash banner, item in the list.
7. Tap **"Discard and try again"** → returns to the mic screen, nothing saved.
8. **Deny** mic permission once → should show a clear "Microphone access was blocked" message rather than hanging.
9. If you have Firefox handy: open `/voice` there → should show the "not supported in this browser" screen with a working "Type it instead" link.

**MODULE 5 COMPLETE 2026-08-20** — user confirmed voice input works well. That also exercises the Verify screen, so most of Module 7 is proven along with it.

---

## 2026-08-20 — Module 6 (OCR / Camera Scanning), phase 1

Three decisions before building:
- **Canvas 2D preprocessing instead of OpenCV.js.** Greyscale + 2× upscale + percentile contrast stretch is ~40 lines with zero dependencies, and it covers what actually helps Tesseract on faint date printing. OpenCV's real value is deskewing and perspective correction — worth adding deliberately if real photos prove it's needed, rather than paying ~8MB preemptively.
- **Phased.** Phase 1 is the core path: camera → preprocess → Tesseract → date parse → Verify. OCR.space fallback and ZXing barcode deferred until we know real accuracy.
- **OCR.space key deferred.** Low-confidence reads currently surface an explicit "double-check the date" warning rather than silently falling back. `CONFIDENCE_THRESHOLD` in `src/lib/ocr.js` is where the fallback hooks in later.

**The parser deliberately doesn't guess the product name.** OCR of packaging picks up marketing copy, nutrition tables and legal small print — a confidently wrong name is worse than a blank field. Barcode (phase 2) is the right source for names, exactly as the roadmap argues: barcodes carry product identity even when the printed date is unreadable.

### What the parser handles
Labelled dates (`EXP` / `USE BY` / `BEST BEFORE` / `MFG`), `DD/MM` with an automatic flip to `MM/DD` when the numbers rule it out, month-only precision, and the roadmap's "X months from manufacturing" case — which chrono genuinely can't do, since it's arithmetic against *another date on the pack* rather than a phrase relative to today.

Month-only dates resolve by context: `EXP 03/2027` becomes the **last** day of March (the product is good *through* the month), while a manufacturing date feeding the relative-shelf-life maths becomes the **first** day (earliest plausible make-date, so the computed expiry errs early rather than late). And `addMonths` clamps the day — `31/12/2026` + 2 months is 28 Feb, not JS's default roll-over to 3 March.

### Two real bugs the tests caught
1. **Fragment scavenging.** An impossible date like `31/02/2027` was correctly rejected as a whole — but the looser month-year pattern then salvaged `02/2027` out of the middle of it and returned end-of-February. Fixed by claiming the matched span even when the date is rejected. Reinterpreting text you've just judged invalid is precisely how a confident wrong date gets produced.
2. **Labels parsed as months** (latent, exposed by fixing #1). The alpha-month pattern matched *any* three letters, so `MFG 01/2026 EXP 01/2028` parsed as `26 EXP 01` — reading the label itself as a month name and swallowing both real dates. Fixed by baking the twelve month abbreviations into the regex rather than validating after the match.

27 tests passing project-wide. `npm run lint` and `npm run build` clean.

### Bundle finding — the Module 5 worry turned out to be moot
Verified empirically: `dist` contains **no** `.wasm` and **no** traineddata. Only a ~17kB tesseract.js wrapper reaches the bundle; the ~4MB WASM core and language data are fetched from jsdelivr at runtime. So there was nothing heavy for Workbox to over-cache after all.

Worth recording that the `globIgnores: ['**/tesseract*.js']` I first wrote **silently did nothing** — Rollup emits the chunk as `src-*.js`, named after the package's internal path, not the package name. Removed it and corrected the comment rather than leaving a guard that looked protective but wasn't.

**Consequence for Module 10:** scanning needs a network connection and a reachable CDN, and voice needs network too (Chrome's recognition is server-side). **Only manual entry is genuinely offline-capable** — the offline UI should say so.

### Module 6 browser test script
Needs a real camera and real packaging — best on a phone, via the deployed HTTPS URL.
1. Home → **Scan** → allow camera → rear camera should open with a guide frame.
2. Line up a printed **expiry/best-before date inside the frame** → **Capture**.
3. First scan downloads the OCR engine from a CDN — expect a few seconds and a progress percentage. Later scans are faster.
4. Should land on **Check the details** with the date filled and tagged **detected**. Name is intentionally blank.
5. Try a **faint or low-contrast** date → should either read it, or show "the print was hard to read, double-check the date".
6. Try a pack with **no visible date** → should say it couldn't find one, not invent one.
7. Try a **"best before X months from manufacturing"** pack if you have one — that's the case with custom date maths behind it.
8. **Deny camera permission** → clear message plus a working "Type it instead" link.

**Please paste back any wrong reads** (what was printed vs what it filled in). The parser is tuned against synthetic text; real packaging is what tells us whether phase 2 is worth building.

---

## 2026-08-20 — Hardening & optimization pass (full audit)

User asked for an audit of everything built so far before continuing. I read every source file and checked the live deployment. Fixed tiers A (visible bugs), B (crash risks) and C (performance); hygiene was scoped out.

### A — bugs that were shipping to users
- **The deployed browser tab said `scaffold-tmp`.** That's the temp folder name from Module 0's `create-vite` workaround, never cleaned up, live on the site this whole time. Title is now "Expiry Tracker". Added meta description, `theme-color` (the manifest's `theme_color` only applies once *installed* — the meta tag is what colours the Android address bar in browser mode) and `apple-touch-icon` (iOS ignores manifest icons entirely).
- **Real app icon** replacing the Vite logo and Module 0's solid-teal squares: a carton with a clock. `scripts/generate-icons.mjs` generates all five files from one glyph constant, so it's re-runnable when proper artwork arrives. Added a **maskable** variant — without one, Android's adaptive-icon crop pillarboxes the icon inside a white circle. Deleted `public/icons.svg`, a dead Vite file that was shipping *and* being precached.
- **"Expiring soon" included already-expired items** — `days <= 7` is also true at −5, so expired items showed under both chips at once.

That last one is the interesting failure. It survived because the logic sat inline in `Home.jsx` where nothing could test it — while the voice and OCR parsers, which are pure functions with test suites, both had their bugs caught. So rather than patching the line I extracted `src/lib/itemFilters.js` and wrote 10 tests, including one asserting no item can *ever* match both "soon" and "expired".

### B — crash risks
- **No error boundary anywhere.** Any render error was a blank white screen. Worse here than on a normal site: installed to a home screen there's no address bar to retry from, so the user needs a button.
- **`localStorage` read unguarded at module import** in `authStore`. In Safari private mode or with site data blocked this throws *before React renders*, taking the whole app down — and an error boundary can't catch it, because it happens during import. Now guarded; worst case onboarding shows twice.
- **Missing env vars produced a white screen.** `supabaseClient` threw at import — same pre-render problem. That's exactly what a Vercel deploy with unset env vars looked like: blank page, reason buried in the console. Now it renders an explanatory screen. Verified by actually blanking `.env.local` and confirming the app served a readable error instead of crashing.
- **Home double-fetched after every save**, and my comment explaining why was simply wrong — it claimed Home stays mounted across the `/add` round-trip, but react-router unmounts it, so the mount effect was already refetching.
- Silent category-load failure in `ItemForm`; unhandled `checkBadgeProgress` promises at three call sites (harmless now, but Module 9 fills that function in); missing unmount guards on three fetches.

### C — performance
- **Tesseract re-initialised on every single scan.** `Tesseract.recognize()` creates a worker and terminates it in a `finally` on every call — confirmed by reading the package source. Now a reused worker with `disposeOcr()` on unmount, so only the first scan of a session pays init cost. A failed init deliberately doesn't cache its rejection, or the scanner could never recover without a page reload.
- **Route code-splitting** for `/add`, `/voice`, `/scan`, `/verify`. Main chunk 495 → 479 kB (146 → 141 kB gzipped), app-shell CSS 8.3 → 5.8 kB. Modest, and worth being honest about: the remaining bulk is supabase-js, react and react-router, all unavoidably on the critical path. The structural win is the real point — heavy new screens can't bloat the shell by default any more.

### A process failure worth recording
**`PROJECT_STATE.json` had been invalid JSON since the Module 5 session.** An edit dropped a key's opening line, and because nothing ever parsed the file, the supposedly machine-readable handoff state silently stopped parsing for two whole modules. Fixed, and `src/lib/projectState.test.js` now parses it on every `npm test` so it can't recur quietly.

38 tests passing, lint and build clean.

### What to test after this
1. **Module 4 list checks** (still never confirmed) — especially that **"Expiring soon" no longer shows expired items**.
2. **Module 6 scan script** above — and watch that the **second scan is noticeably faster than the first**. That's the worker reuse working.
3. Tab should show the new icon and read "Expiry Tracker".
4. On Android, reinstall to the home screen and check the icon isn't clipped or ringed in white.
