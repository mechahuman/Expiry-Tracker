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

**Confirmed working 2026-08-20.** OCR reads dates correctly most of the time on real packaging, so **Module 6 phase 2's OCR.space fallback was judged unnecessary and dropped.** ZXing barcode stays optional — it's the only route to filling in product names, which are blank after every scan today.

**MODULE 7 COMPLETE** — the Verify screen was built during Module 5 and has now been exercised by both the Voice and OCR paths, which is exactly its Done-when checklist.

---

## 2026-08-20 — Module 8 (Notifications) — code complete, needs deploying

### Web Push instead of Firebase
The roadmap specced FCM. We went with **standard Web Push + VAPID** instead: no Firebase project, no Firebase SDK in the bundle, one fewer third-party account. Coverage for a PWA is the same — Chrome, Edge, Firefox, and Safari 16.4+ once installed to the home screen — because FCM's web support is a wrapper over this same browser API. Keys are generated locally and cost nothing.

**Table name deviates from the roadmap** for the same reason: it specced `push_tokens`, which is FCM's model of one opaque token per device. Web Push issues a *subscription object* — an endpoint URL plus two encryption keys — so the table is `push_subscriptions` and matches that shape.

### The service worker had to change modes
`vite-plugin-pwa` was in `generateSW` mode, which auto-writes the worker — and an auto-written worker can't carry custom `push` and `notificationclick` listeners. Switched to **`injectManifest`** with a hand-written `src/sw.js` that does the precaching Workbox was doing, plus the push handlers. This was forced by the feature, not a preference.

### Decisions
- **Daily digest at 09:00 IST**, covering anything expiring within 3 days. One notification a day, not a stream.
- **Permission asked from a dismissible card on Home**, and only once you actually have items. Deliberate: a browser-level denial is close to unrecoverable — buried in site settings — so the one browser prompt is only spent on someone who's already said yes inside the app.
- **No dedup bookkeeping.** A daily digest repeats by design: something 3 days out gets mentioned on day 3, 2 and 1. That's what a digest is.

### Details worth knowing
- The Edge Function derives "today" **in IST**, not UTC, so a manual mid-afternoon test agrees with the 9am cron run. The cron expression itself is UTC (`30 3 * * *`) — if the reminder time moves, both must change together.
- **Dead subscriptions get retired.** A push service returning 404/410 means the browser threw the subscription away permanently (uninstall, cleared data, revoked permission), so those rows get `expired_at` set and the job stops retrying them every morning. Other errors are treated as transient and left alone.
- **The endpoint refuses to run without `CRON_SECRET` configured.** An open endpoint that can push to every user is worse than a broken one.
- The message builder is a dependency-free file so Vitest can import it despite the function running on Deno — **10 tests**, including that an already-overdue item reads "expires today" rather than "in −2 days".

47 tests passing, lint and build clean, service worker verified to contain both handlers after minification.

### Two risks I can't clear myself
1. **`npm:web-push` in Deno.** Supabase Edge Functions support npm specifiers via Deno's Node compatibility and this is the common approach, but it's the single most likely thing to fail on first deploy. If it does, the fallback is a Deno-native push library or hand-rolled RFC 8291 encryption.
2. **Supabase free-tier pausing.** Flagged all the way back in the original roadmap analysis: a free project pauses after ~1 week of inactivity, and a paused project runs no cron jobs. Reminders stop *silently*, with nothing in `cron.job_run_details` — because the scheduler isn't running to log anything. Check for a paused project before debugging the cron.

**I cannot test push delivery** — it needs a real device, a granted permission, and the deployed HTTPS service worker.

---

## 2026-08-25 — Module 9 (Rewards & Badges) — code complete, needs the SQL run

### What this module actually is
Home showed **"Points: 0"** permanently, `badges`/`user_badges` were empty, and `checkBadgeProgress()` was a no-op stub wired in back in Module 4. This fills all of it in: points for adding items and for using them before they expire, badges at milestones, and a screen to see them.

### The real work: taking the score away from the browser
Until now the browser could write its own `profiles.points` and insert its own `user_badges` rows. RLS only asked *"is this your row?"*, never *"did you earn this?"*. Flagged in the Module 1 audit, deferred to here.

**I confirmed the hole was real before fixing it.** With only the public anon key and an ordinary user session:
```
PATCH /rest/v1/profiles  {"points": 999999}  ->  HTTP 200, value written
```
The parallel badge-insert attempt failed with `23503`, but *only* because the `badges` table was empty — a foreign-key violation, not a security control. Once seeded, that would have worked too.

The fix moves the decision into the database. `sync_rewards()` counts the user's real items itself and writes the result; the client's write privileges on those columns are revoked outright. **The client never supplies a number, so it can't lie about one.**

Two properties worth naming:
- **It takes no user-id parameter.** It reads `auth.uid()` from the JWT. A parameter would let any caller award any account — that's the single most important line in the file, and `006_verify_rewards.sql` asserts `pronargs = 0` so it can't regress.
- **Points are recomputed, not accumulated.** Derived from stored data every call, so repeat calls can't inflate a score and a dropped one self-corrects. It also means a tampered value heals itself — which is why I deliberately left that `999999` on the test user. The first `sync_rewards()` call after you run the SQL should collapse it back to the true value.

### Smaller things worth knowing
- The `used_before_expiry` counter casts through `Asia/Kolkata`. `used_at` is `timestamptz`, and a bare `::date` resolves in the connection's UTC — which would mis-score an item used late on an Indian evening. Same IST reasoning as the Module 8 Edge Function.
- `coalesce((v_progress ->> b.criteria_type)::int, 0)` is what makes the deferred badges safe. Seed a `streak_days` badge later and it simply never unlocks until that key exists — no error, no false award.
- `badges.name` had no unique constraint, so the seed would have duplicated all six on a re-run. 005 dedupes, adds the constraint, then upserts on it.
- **Removed** the rewards call from `AddItem` and `VerifyItem`. Navigating unmounts them and mounts Home, which syncs itself — awarding from a screen that's about to disappear just added a race for nothing.

### Testability — a genuine step down, stated plainly
This module's core logic is SQL, which Vitest can't reach. Modules 5, 6 and 8 all had their risky logic in JavaScript, and tests caught real bugs there before you ever saw them. Here the awarding logic is only covered by `006_verify_rewards.sql`, a script someone has to remember to run. I extracted the progress maths into `rewardProgress.js` so at least that part is tested (10 tests), but I don't want to overstate the coverage.

57 tests passing, lint and build clean, Rewards split into its own 1.2KB lazy chunk.

### To finish this module
1. Run `supabase/005_rewards.sql` in the SQL Editor. **Nothing in the rewards UI works until this happens** — `sync_rewards()` currently returns `PGRST202`, function not found.
2. Run `supabase/006_verify_rewards.sql` (replace `<test-uuid>` with a real user id). Every check should read PASS, and **the two tamper statements in STEP 5 must ERROR** — that's the module's whole purpose.
3. Browser: add an item → Home points rise and a "Badge unlocked" banner appears → tap the points → Rewards screen shows the unlocked badge and progress bars on the rest.

---

## 2026-08-27 — Module 10 (PWA Polish — offline behaviour)

Most of what the roadmap lists under Module 10 was already done in the hardening pass (real icons, maskable variant, `theme_color`, `apple-touch-icon`, correct manifest). What remained was the part that actually needed designing: **what the app honestly does with no connection.**

### A regression we caused, found and fixed
**The service worker had no navigation fallback.** `index.html` was precached, but nothing mapped a navigation request for `/home` onto it — so a cold start or refresh on any sub-route failed offline *with the entire app shell sitting in cache*.

We introduced this ourselves in Module 8. Switching to `injectManifest` (needed for the push handlers) meant `navigateFallback` stopped applying — it's a `generateSW`-only option — and nothing replaced it. Verified before fixing: `NavigationRoute` appeared **0 times** in the built worker.

**Verifying the fix needs care**, worth recording: grepping for `NavigationRoute` *still* returns 0 afterwards, because the minifier mangles class names. Three checks that do work: `createHandlerBoundToURL` went 1 → 2 (library export plus our call site), the minified `I(new q(W(\`index.html\`),{denylist:[...` fragment is present, and there's a `.mode===\`navigate\`` check. All three confirmed. Push handlers verified still intact afterwards, since they live in the same file.

### Last-synced inventory
Cached in `localStorage` keyed by user id — deliberately **not** by runtime-caching Supabase's REST responses in Workbox. That looks tidier but is unsafe: the auth token travels in a *header*, not the URL, so a URL-keyed HTTP cache would serve one account's inventory to whoever signs in next on a shared device. Cleared on sign-out.

The cache is only ever written from a *successful* response, so a failed fetch can't poison it, and an entry whose shape doesn't match is treated as absent (cached data outlives deploys). Home falls back to it when a fetch fails, showing "Offline — showing items last synced 3 hours ago", and silently refetches when the connection returns.

### Being honest about what needs a connection
Voice and Scan are **disabled** offline rather than left to fail — Chrome's speech recognition is server-side and Tesseract fetches its WASM core from a CDN. Manual entry stays reachable, with the form warning up front rather than after you've filled it in; submitting offline refuses with a clear message. Per the decision taken, nothing is queued — an item that silently vanishes is worse than one that plainly refused to save.

While extracting this I noticed the Voice/Scan block was **duplicated** in two places on Home, so the offline handling would have had to be kept in sync across both copies. Pulled it out into one `AddActions` component.

### Post-deploy chunk 404
Routes are lazy-loaded since the hardening pass, so a tab open across a deploy can request a chunk whose hashed filename no longer exists — and `skipWaiting()` makes that likelier, not rarer. Failed dynamic imports now reload once, guarded by a `sessionStorage` flag so a genuinely broken chunk can't cause a loop.

### One shared-class lesson, third time
`.offline-banner` started in `Home.css`, then `ItemForm` needed it too. A class defined in one page's stylesheet only works elsewhere by accident of import order — which breaks under code-splitting, which we now have. Moved to `index.css`. Same trap as `.field`/`.form-banner` in Module 3 and `.header-spacer` in Module 5.

74 tests passing, lint and build clean, production build serves all routes.

**I can't verify real offline behaviour** — that needs a browser with the network actually cut.

### Module 10 browser test script
1. `npm run preview`, open DevTools → Network → **Offline**, then **hard-refresh on `/home`**. The app shell should load with an offline banner instead of the browser's error page. *This is the scenario that failed before this module.*
2. Still offline: the inventory should show last-synced items with "last synced …"; Voice and Scan greyed out with a reason; Add opens but warns and refuses to save.
3. Go back online → the stale banner should clear itself without you navigating.
4. On the phone, installed to the home screen: airplane mode → open the app → same behaviour.

---

## UI/UX rebuild — ClearEat design system (2026-08-27)

Source: Builder.io Visual Copilot export of the ClearEat Figma (38 frames).
The `api.builder.io/.../TEMP/` asset URLs are public but expected to expire, so
all 38 exports are preserved in `design/figma/`.

### What the design actually is

Tokens extracted from the export rather than eyeballed:

| Token | Value | Was |
|---|---|---|
| Font | Poppins | system-ui |
| Brand | `#1e5e3c` forest green | `#0f9d8a` teal |
| Accent | `#4caf6d` | — |
| Background | `#fff7ec` cream | `#ffffff` |
| Warning | `#ff9a3c` | `#d97706` |
| Danger | `#e74c3c` | `#dc2626` |
| Radii | 100px pills, 12/16/20/28 | flat 12px |

Cream page + white cards is the signature pairing. A white page loses it.

### Three structural findings

1. **A 5-slot bottom nav** (Home · My Food · **+** · Alerts · Progress) on 27 of
   38 frames. We had none. The design's Home is a *dashboard* and its My Food is
   the list — our old Home was both, so it was split into `/home` and `/food`.
2. **No dark mode anywhere.** Decision: dropped, light-only.
3. **No auth screen at all** — zero password/sign-in/sign-up across all frames.
   Auth can't go (RLS keys off `auth.uid()`), so Login was restyled instead.

### Decisions worth remembering

- **Poppins is self-hosted**, latin subset only, *not* the Google Fonts CDN — a
  CDN link falls back to system-ui offline, exactly when Module 10's offline
  shell is doing its job. This required adding `woff2` to
  `injectManifest.globPatterns`: without it the font CSS was precached but the
  font file it referenced was not. Verified — 0 woff2 in `dist/sw.js` before,
  4 after.
- **Alerts is deliberately partial.** It shows real expiring items but omits the
  design's per-item *"Suggested action: mash into guacamole!"* copy. That has to
  come from a curated map or a model; generating it per category would produce
  confident nonsense for anything unrecognised.
- **"14.2 kg Avoided" was not built.** No weight is stored anywhere, and a
  fabricated kilo figure is exactly the sort of number that gets quoted
  elsewhere. Replaced with badges-unlocked.

### Verification

- 88 tests passing (was 74) · lint clean · build clean · precache 39 entries
- Module 10 navigation fallback still intact (`createHandlerBoundToURL` ×2)
- Module 8 push handlers still intact
- `/`, `/home`, `/food`, `/alerts`, `/rewards` all 200 from `npm run preview`

### Browser test script

1. `npm run dev`. **Home** should show a green brand bar on a cream page, a
   greeting, and — once you have items — a priority card, a 3-up stat row, and
   "Recently Added".
2. Tap each of the four nav tabs. The centre **+** goes to Add.
3. **My Food**: check the chips (All / Expired / Today / This Week / Later) and
   that headings group the list only under "All".
4. **Progress**: streak card, three stats, achievements grid.
5. Confirm the font is Poppins, not system-ui — DevTools → Network → Fonts
   should show `poppins-latin-*.woff2`.
6. Check **dark mode is gone**: put your OS in dark mode; the app should stay
   cream.
7. Offline re-test (Module 10 still holds): DevTools → Network → Offline, hard
   refresh `/home`. Shell loads, offline banner shows, **and the font is still
   Poppins** — that last part is what the woff2 precache fix bought.

### Not done (tracked)

Notification Settings · Item Detail · Permissions · Splash screens; migration
007 for `location` + `notes`; multi-item receipt OCR (a feature rebuild, not a
restyle); per-item suggested actions on Alerts.

### Follow-up — Add Food chooser (2026-08-29)

**Bug reported by the user:** tapping the nav's **+** went straight to the
manual form, with no Voice or Scan option.

**Cause, and it was worse than it looked.** The rebuild wired the FAB directly
to `/add`. The three capture options survived only inside `AddActions`, which
renders in the Home and My Food *empty states* — so the moment a user had any
items at all, **Voice and Scan were unreachable from anywhere in the app.**

**Fix:** built the screen the design already specifies
(`design/figma/add-food-entry.html`) — an "Add Food" chooser with three cards,
copy taken verbatim from the frame.

The routing split was mandatory rather than cosmetic:

| Path | Screen |
|---|---|
| `/add` | AddFood chooser (new) |
| `/add/manual` | AddItem, the form |

`ScanItem` and `VoiceInput` each have two **"Type it instead"** buttons that
pointed at `/add`. Had `/add` simply become the chooser, all four would have
looped the user straight back into the chooser they came from — destroying the
only escape route out of a failed scan. Guarded by a grep in the verification
step.

`AddActions` was deleted. Empty states now show a single "Add Food" button, per
the design's own empty frames — which means the Voice/Scan offline rules now
live in one component instead of two that had to stay in step.

Deliberately unchanged: `VerifyItem`'s `retryPath` fallback of `/add`. Its
button reads "Discard and try again", so the chooser is the *better* landing.

**Verified:** 88 tests, lint and build clean, all 8 routes 200 from preview —
including `/add/manual`, worth checking because Module 10's navigation-fallback
denylist regex could have mishandled a nested path.

**Browser check:** tap **+** → three cards. From Scan and Voice, "Type it
instead" must land on the *form*, not back on the chooser. Offline, Scan and
Voice are disabled with a reason and Manual still works.

### Brand assets, phases A–B — design images recovered (2026-08-29)

**A time-sensitive find.** The Builder export listed `"imageData":[]`, implying
no images came across. They had — the `<img src>` URLs in the frames still
resolve, via a 301 from `api.builder.io` to `cdn.builder.io`. All five are now
archived in `design/figma/images/`: the ClearEat logo lockup, three onboarding
illustrations, and the receipt viewfinder backdrop.

**The `?width=` parameter does not upscale.** `cleareat-logo` is 260×195
native, and the circular mark inside it is only ~90px across — which is exactly
why it cannot source a 512×512 app icon.

**Onboarding now uses the real artwork** instead of the 🧊 🔔 🌱 emoji I had
picked as placeholders.

**PNG → WebP, q82: 346 KiB → 28 KiB (92% smaller)**, visually indistinguishable
for flat vector-style art. Precache had jumped to 1127 KiB with the PNGs; it is
809 KiB with WebP, against a 781 KiB baseline.

**The globPatterns trap, a second time.** `webp` had to be added to
`injectManifest.globPatterns` exactly as `woff2` did during the rebuild. An
extension missing from that list is silently not precached — the markup
referencing it caches fine and the asset 404s offline. Verified: 3 `.webp`
entries now in `dist/sw.js`.

Also deleted `src/assets/hero.png`, `react.svg`, `vite.svg` — Vite scaffold
leftovers, all confirmed unreferenced.

**Still blocked on source files** for phases C (icons) and D (in-app logo).
