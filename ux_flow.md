# Expiry Tracker — Complete UX Flow

> A Progressive Web App (PWA) built with **Vite + React**, **Supabase** (Postgres + Auth), and **Tesseract.js** (OCR). Deployed on Vercel.  
> Tech stack: `react-router-dom` v7, `zustand`, `react-hook-form`, `chrono-node`, `tesseract.js`, Web Speech API, Web Push API, Workbox service worker.

---

## 1. High-Level Route Map

```
/  ──────────────── RootRedirect (decides where to send the user)
     │
     ├─ [not onboarded] ──────────────► /onboarding
     │                                       │
     │                                       ▼
     │                             (completes onboarding)
     │                                       │
     ├─ [onboarded, no session] ──────────► /login
     │                                       │
     │                          ┌────────────┘
     │                          ▼
     └─ [onboarded, session]─► /home  (ProtectedRoute)
                                │
          ┌─────────────────────┼──────────────────────┐
          ▼                     ▼                       ▼
        /add                 /voice                  /scan
    (ProtectedRoute)     (ProtectedRoute)       (ProtectedRoute)
          │                     │                       │
          │         ┌───────────┘                       │
          │         ▼                                   ▼
          │      /verify ◄────────────────────────── /verify
          │   (ProtectedRoute)                  (ProtectedRoute)
          │         │                                   │
          └────►    └──────────────────────────────────►│
                                                        │
                                                    /home (flash banner)
```

---

## 2. Session Initialization (App Bootstrap)

**File:** [`App.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/App.jsx), [`authStore.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/store/authStore.js)

When the app loads for the first time in the browser:

1. **Supabase session restore** — `supabase.auth.getSession()` is called; the store's `loading` flag starts as `true` and flips to `false` once it resolves.
2. **Auth state listener** — `onAuthStateChange` keeps the Zustand store in sync for the whole app lifetime (login, logout, token refresh).
3. **`RootRedirect`** evaluates three things in order:
   - If `loading === true` → render `<div class="splash">Loading…</div>`
   - If `hasOnboarded === false` (localStorage key missing) → navigate to `/onboarding`
   - If `session` exists → navigate to `/home`; otherwise → navigate to `/login`

> **Edge case:** Protected routes also show a splash while `loading === true`, so a page refresh on `/home` never incorrectly bounces a logged-in user to `/login`.

---

## 3. Flow 1 — First-Time User (Onboarding)

**File:** [`Onboarding.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/pages/Onboarding.jsx)

```
Browser opens app (first visit)
        │
        ▼
  RootRedirect: hasOnboarded = false
        │
        ▼
  /onboarding
  ┌─────────────────────────────────────────┐
  │  CSS scroll-snap carousel (3 slides):   │
  │  🧊 "Know what's in your kitchen"       │
  │  🎙️ "Add items in seconds"             │
  │  🔔 "Never waste food again"            │
  │                                          │
  │  [Swipe to see more]  [Get started]     │
  └─────────────────────────────────────────┘
        │ tap "Get started"
        ▼
  completeOnboarding() → sets localStorage key
        │
        ▼
  navigate('/login', { replace: true })
```

- The "swipe to see more" hint is a `<p>` label; scrolling is pure CSS `scroll-snap`.
- "Get started" can be tapped at any slide — user doesn't need to see all three.
- `hasOnboarded` is persisted to `localStorage` (key: `expiry-tracker:onboarded`). If `localStorage` is blocked (Safari private mode), it silently fails — onboarding may show again next visit, which is the safest failure mode.

---

## 4. Flow 2 — Authentication

**File:** [`Login.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/pages/Login.jsx)

The login screen handles **both Sign Up and Log In** in a single toggled view.

### 4a. Log In (default mode)

```
/login (mode = 'login')
┌──────────────────────────────────┐
│  Expiry Tracker                  │
│  "Welcome back."                 │
│                                  │
│  Email: [_____________]          │
│  Password: [_____________]       │
│                                  │
│  [error banner if any]           │
│  [notice banner if any]          │
│                                  │
│  [Log in]                        │
│  New here? [Create one]          │
└──────────────────────────────────┘
      │
      ├─ validation errors (inline, React Hook Form):
      │    • Email required / invalid format
      │    • Password required / min 6 chars
      │
      ├─ submit: supabase.auth.signInWithPassword()
      │    ├─ error → show formError banner (red)
      │    └─ success → onAuthStateChange fires → setSession() →
      │                 Login component sees session → redirect to /home
      │
      └─ tap "Create one" → switches mode to 'signup' (no navigation)
```

### 4b. Sign Up

```
/login (mode = 'signup')
┌──────────────────────────────────┐
│  Expiry Tracker                  │
│  "Create an account to get       │
│   started."                      │
│                                  │
│  Email: [_____________]          │
│  Password: [_____________]       │
│  (autocomplete="new-password")   │
│                                  │
│  [Sign up]                       │
│  Already have an account? [Log in]│
└──────────────────────────────────┘
      │
      ├─ submit: supabase.auth.signUp()
      │    ├─ error → show formError banner
      │    ├─ no session (email confirmation ON) →
      │    │    show notice "Check your inbox…", switch to 'login' mode
      │    └─ success (email confirmation OFF, dev default) →
      │         onAuthStateChange fires → redirect to /home
      │
      └─ tap "Log in" → switches mode to 'login'
```

> **Behind the scenes on sign-up:** A Postgres trigger (`handle_new_user`, AFTER INSERT on `auth.users`) automatically creates a `profiles` row with `points = 0`. The client does NOT insert profiles — this is intentional.

> **If already signed in:** Navigating directly to `/login` with an active session immediately redirects to `/home` (no flash).

---

## 5. Flow 3 — Home Screen (Inventory Dashboard)

**File:** [`Home.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/pages/Home.jsx), [`ItemCard.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/components/ItemCard.jsx)

```
/home (ProtectedRoute)
┌─────────────────────────────────────────────────┐
│  Your kitchen          [user@example.com] [Log out] │
├─────────────────────────────────────────────────┤
│  [flash banner] (auto-dismisses after 3s)       │
│  [error banner if any]                          │
├─────────────────────────────────────────────────┤
│  STATE A: loading → "Loading your kitchen…"     │
│                                                  │
│  STATE B: empty (no items) →                    │
│    🛒 "Nothing here yet"                        │
│    "Items you add will show up here…"           │
│    [Add your first item]                        │
│    [🎙️ Voice]   [📷 Scan]                      │
│                                                  │
│  STATE C: has items →                           │
│    [Search your items… 🔍]                     │
│    Filter chips: [All] [Expiring soon]          │
│                  [Expired] [<Category>…]        │
│                                                  │
│    Item list (sorted by expiry_date ASC):       │
│    ┌───────────────────────────────────────┐    │
│    │ Item Name          [red badge]        │    │
│    │ 2 pcs · Dairy      Expired 3d ago     │    │
│    │                    [Mark as used]     │    │
│    ├───────────────────────────────────────┤    │
│    │ Item Name          [orange badge]     │    │
│    │ 500 g · Snacks     5 days left        │    │
│    │                    [Mark as used]     │    │
│    ├───────────────────────────────────────┤    │
│    │ Item Name          [teal badge]       │    │
│    │ 1 l · Beverages    60 days left       │    │
│    │                    [Mark as used]     │    │
│    └───────────────────────────────────────┘    │
│                                                  │
│    FAB row:                                     │
│    [+ Add item]                                 │
│    [🎙️ Voice]   [📷 Scan]                      │
├─────────────────────────────────────────────────┤
│  Footer: Points: 0   (from profiles row)        │
└─────────────────────────────────────────────────┘
```

### 5a. Filter Chips

| Chip | Logic |
|------|-------|
| **All** | All active items |
| **Expiring soon** | `days >= 0 && days <= 7` — strictly excludes already-expired |
| **Expired** | `days < 0` |
| **`<Category>`** | One chip per category actually in the current inventory |

Search and filter compose: both apply simultaneously via `useMemo` — no network calls per keystroke.

### 5b. Expiry Badge Colors

| Color | Threshold | Label examples |
|-------|-----------|----------------|
| 🔴 **Red** (urgent) | `days <= 2` incl. negative | "Expired 3d ago", "Expires today", "Expires tomorrow" |
| 🟠 **Orange** (soon) | `days <= 7` | "5 days left" |
| 🟢 **Teal** (ok) | `days > 7` | "60 days left" |

### 5c. Mark as Used

```
tap [Mark as used] on an item
        │
        ▼
  setMarkingId(id) → button shows "Marking…", disabled
        │
        ▼
  supabase UPDATE inventory_items SET status='used', used_at=now()
        │
        ├─ error → show itemsError banner, setMarkingId(null)
        └─ success → remove item from local state (optimistic)
                   → checkBadgeProgress(userId) [fire-and-forget, no-op stub]
                   → setMarkingId(null)
```

### 5d. Flash Banner

- Set via `location.state.flash` (passed from `/add` or `/verify` on save)
- Auto-dismissed after 3 seconds via `setTimeout`
- Removed from history state after dismissal so back-navigation doesn't re-show it

### 5e. Push Notification Prompt (PushPrompt)

Conditionally rendered on Home **only when the user has at least one item** and notification permission is `'default'` (never asked) and not previously dismissed.

```
┌──────────────────────────────────────┐
│  🔔 Get reminded before food expires │
│  "A single daily nudge about anything│
│   going off in the next three days." │
│                                      │
│  [Turn on reminders]  [Not now]      │
└──────────────────────────────────────┘
```

- **Turn on reminders** → calls `enablePushNotifications(userId)` → asks browser permission → subscribes via `PushManager` → upserts to `push_subscriptions` table in Supabase
- **Not now** → dismissed flag written to `localStorage` (`expiry-tracker:push-dismissed`)
- If permission is already `'granted'` or `'denied'`, or if push is unsupported, the card is hidden entirely

### 5f. Log Out

```
tap [Log out]
      │
      ▼
supabase.auth.signOut()
      │
      ▼
onAuthStateChange fires (SIGNED_OUT)
      │
      ▼
setSession(null) → session = null in store
      │
      ▼
ProtectedRoute sees no session → redirect to /login
```

---

## 6. Flow 4 — Add Item (Manual Entry)

**Files:** [`AddItem.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/pages/AddItem.jsx), [`ItemForm.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/components/ItemForm.jsx)

```
/home → tap [Add your first item] or [+ Add item]
        │
        ▼
/add (ProtectedRoute)
┌────────────────────────────────────┐
│  [Cancel]     Add item     [spacer]│
├────────────────────────────────────┤
│  <ItemForm inputMethod="manual">   │
│                                    │
│  Name*: [___________________]      │
│  (error: "Name is required")       │
│                                    │
│  Quantity* [_] Unit: [pcs ▼]      │
│  (error: "Must be greater than 0") │
│                                    │
│  Category: [Uncategorized ▼]       │
│  (options fetched from DB)         │
│                                    │
│  Expiry date*: [date picker]       │
│  ⚠️ "This date is in the past."    │
│  (soft warning, non-blocking)      │
│                                    │
│  [error banner if save fails]      │
│                                    │
│  [Save item]                       │
└────────────────────────────────────┘
```

### Form Fields

| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| Name | text | Required | e.g. "Amul milk" |
| Quantity | number | Required, > 0 | Mirrors DB `check (quantity > 0)` |
| Unit | select | Required | pcs / g / kg / ml / l / packs |
| Category | select | Optional | Fetched from `categories` table |
| Expiry date | date | Required | Past dates allowed with a soft warning |

### Save Flow

```
user fills form → tap [Save item]
        │
        ▼
supabase INSERT inventory_items {
  user_id, name, quantity, unit, category_id, expiry_date,
  input_method: 'manual', status: 'active'
}
        │
        ├─ error → show submitError banner
        └─ success → checkBadgeProgress(userId) [fire-and-forget]
                   → navigate('/home', { state: { flash: '"Name" added' } })
```

### Cancel Flow

```
tap [Cancel] → navigate('/home') with no state (no flash, nothing saved)
```

---

## 7. Flow 5 — Voice Input

**Files:** [`VoiceInput.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/pages/VoiceInput.jsx), [`speech.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/lib/speech.js), [`voiceParser.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/lib/voiceParser.js)

```
/home → tap [🎙️ Voice]
        │
        ▼
/voice (ProtectedRoute)
```

### 7a. Browser Not Supported (Firefox etc.)

```
┌──────────────────────────────────────────┐
│  [Cancel]    Add by voice    [spacer]    │
├──────────────────────────────────────────┤
│  ❌ "Voice input isn't supported in this  │
│      browser. Chrome or Safari support   │
│      it — or you can add the item by     │
│      typing instead."                   │
│                                          │
│  [Type it instead] → navigates to /add  │
└──────────────────────────────────────────┘
```

### 7b. Supported Browser — Main Flow

```
/voice (supported)
┌──────────────────────────────────────────┐
│  [Cancel]    Add by voice    [spacer]    │
├──────────────────────────────────────────┤
│  Try: "two packs of milk expiring        │
│         25th August"                    │
│                                          │
│  STATE: idle                            │
│  [🎙️ mic button]                        │
│  "Tap the mic and say what you're adding"│
│                                          │
│  STATE: listening (button pulses)       │
│  [🎙️ mic button]                        │
│  "Listening… tap to stop"               │
│  [live transcript text appears here]    │
│                                          │
│  STATE: parsing                         │
│  [🎙️ mic button (disabled)]            │
│  "Working out what you said…"           │
│                                          │
│  [error banner if any]                  │
│  [Type it instead] → /add               │
└──────────────────────────────────────────┘
```

### 7c. Voice Parsing Pipeline

```
User speaks → SpeechRecognition (lang: en-IN)
        │
        ├─ onInterim → update transcript display (live)
        └─ onFinal → raw text e.g. "two packs of milk expiring 25th August"
                │
                ▼
        parseTranscript(text)  [voiceParser.js]
        │
        │  Step 1: match Qty+Unit  →  { quantity: 2, unit: 'packs' }
        │  Step 2: chrono date parse (forwardDate: true)
        │          (any chrono hit overlapping qty span is discarded
        │           to prevent "two" being read as "2 o'clock")
        │          →  { expiry_date: '2026-08-25' }
        │  Step 3: bare number fallback if Step 1 missed
        │  Step 4: cleanName() on remaining text
        │          →  { name: 'Milk' }
        │
        └─ returns { name, quantity, unit, expiry_date, detected, transcript }
           where `detected` flags which fields were auto-filled
                │
                ▼
        navigate('/verify', { state: { parsed, detected, transcript, inputMethod: 'voice' } })
```

> **"Blank is safer than wrong" rule:** Any field not confidently extracted is left `null`, not guessed.

### 7d. Mic Errors

| Error code | Message shown |
|------------|---------------|
| `not-allowed` / `service-not-allowed` | "Microphone access was blocked. Allow it in your browser settings…" |
| `no-speech` | "Didn't catch anything. Try again and speak clearly." |
| `audio-capture` | "No microphone found on this device." |
| `network` | "Speech recognition needs a network connection." |
| `aborted` | (silent — user stopped it themselves) |

---

## 8. Flow 6 — Camera Scan (OCR)

**Files:** [`ScanItem.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/pages/ScanItem.jsx), [`ocr.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/lib/ocr.js), [`ocrParser.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/lib/ocrParser.js), [`imagePreprocess.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/lib/imagePreprocess.js)

```
/home → tap [📷 Scan]
        │
        ▼
/scan (ProtectedRoute)
```

### 8a. Camera Error States

| Condition | Error shown |
|-----------|-------------|
| Browser has no `getUserMedia` | "Camera access isn't available in this browser." |
| User denies permission | "Camera access was blocked. Allow it in your browser settings and try again." |
| No camera device | "No camera found on this device." |
| Other failure | "Could not start the camera. Try again." |

All camera errors show a **[Type it instead]** fallback → navigates to `/add`.

### 8b. Camera Ready — Main Flow

```
/scan (status: starting → ready)
┌──────────────────────────────────────────┐
│  [Cancel]    Scan the pack    [spacer]   │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │   live camera feed (rear camera)   │  │
│  │                                    │  │
│  │   ┌──────────────────────────────┐ │  │
│  │   │   guide frame (86% × 30%)    │ │  │ ← only this region sent to OCR
│  │   └──────────────────────────────┘ │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  "Line up the expiry or best-before      │
│   date inside the frame."               │
│                                          │
│  [Capture]                              │
│  [Type it instead] → /add               │
└──────────────────────────────────────────┘
```

### 8c. Capture → OCR Pipeline

```
tap [Capture]
        │
        ▼
  STATUS: 'working'
  [Capture] → [Reading…] (disabled)
  Overlay: "Reading the label… X%"
        │
        ▼
  preprocessForOcr(videoFrame, guideCrop):
  • Crop guide region from frame
  • Upscale to 1600px width (Tesseract accuracy boost)
  • Greyscale (Rec. 709 luma)
  • Percentile contrast stretch (2% cut each end)
        │
        ▼
  recognizeText(canvas) [Tesseract.js, worker reused across scans]
  → { text, confidence, lowConfidence }
        │
        ▼
  stopCamera() ← camera released once frame is captured
        │
        ▼
  parseOcrText(text) [ocrParser.js]:
  │  Rule 1: "X months from manufacture" + MFG date → compute expiry
  │  Rule 2: Near an EXP/USE BY/BEST BEFORE label
  │  Rule 3: Latest unlabelled date (excluding MFG)
  │
  → { expiry_date: '2027-03-31', detected: { expiry_date: true } }
        │
        ▼
  navigate('/verify', { state: {
    parsed: { name: '', quantity: null, unit: null, expiry_date },
    detected,
    transcript: 'Read from the pack (87% confident)',  ← if date found
    inputMethod: 'ocr',
    warning: ''  ← or low-confidence / no-date warning
  }})
```

### 8d. OCR Warnings

| Condition | Warning shown on /verify |
|-----------|--------------------------|
| No date found | "Couldn't find a date on the pack — enter it below, or rescan…" |
| Confidence < 60% | "The print was hard to read, so double-check the date before saving." |
| Date found, high confidence | No warning |

> **Note:** OCR never guesses the product name — only the expiry date. Marketing copy and nutrition tables make name OCR unreliable.

> **Performance:** Only the first scan of a session initialises the Tesseract worker. Subsequent scans reuse it. `disposeOcr()` is called on `/scan` unmount.

---

## 9. Flow 7 — Verify Details (Voice + OCR shared screen)

**Files:** [`VerifyItem.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/pages/VerifyItem.jsx), [`ItemForm.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/components/ItemForm.jsx)

```
/verify (ProtectedRoute)
-- receives location.state: { parsed, detected, transcript, inputMethod, warning }
```

> If navigated to directly (deep link, refresh, or back-nav after saving) with no state, immediately redirects to `/home`.

```
/verify
┌──────────────────────────────────────────┐
│  [Cancel]    Check the details  [spacer] │
├──────────────────────────────────────────┤
│  [if voice]:  You said: "two packs of   │
│               milk expiring 25th August" │
│  [if ocr]:    "Read from the pack        │
│               (87% confident)"          │
│                                          │
│  [warning banner if OCR low confidence  │
│   or no date found]                     │
│                                          │
│  "Tagged fields were filled in           │
│   automatically — check them before     │
│   saving. Anything blank wasn't clear   │
│   enough to guess."                     │
│                                          │
│  <ItemForm                              │
│    initialValues={parsed}               │
│    detectedFields={detected}            │  ← auto-filled fields get
│    inputMethod={inputMethod}            │     a "detected" tag label
│    submitLabel="Save item"              │
│  />                                     │
│                                          │
│  [Discard and try again]                │
└──────────────────────────────────────────┘
```

### Detected Field Tags

Fields auto-filled by voice/OCR get a small `detected` tag next to their label, signalling to the user they should verify these values before saving.

### Save (same as manual)

```
tap [Save item]
        │
        ▼
supabase INSERT inventory_items { ..., input_method: 'voice' | 'ocr' }
        │
        └─ success → checkBadgeProgress(userId) [fire-and-forget]
                   → navigate('/home', { state: { flash: '"Name" added' } })
```

### Discard and Try Again

```
tap [Discard and try again]
        │
        ├─ inputMethod === 'voice' → navigate('/voice', { replace: true })
        ├─ inputMethod === 'ocr'   → navigate('/scan', { replace: true })
        └─ other                   → navigate('/add', { replace: true })
```

### Cancel

```
tap [Cancel] → navigate('/home') with no state
```

---

## 10. Background: Push Notifications

**Files:** [`push.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/lib/push.js), [`sw.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/sw.js), [`PushPrompt.jsx`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/components/PushPrompt.jsx)

```
Daily (server-side Edge Function, not yet built):
  Query items expiring within 3 days
        │
        ▼
  Send Web Push to user's push_subscriptions endpoint
        │
        ▼
  Service Worker 'push' event handler (sw.js):
  → showNotification({
      title: "Expiry Tracker",
      body: "Some items in your kitchen are expiring soon.",
      icon: '/icon-192.png',
      tag: 'expiry-reminder',  ← collapses repeat notifications
      renotify: true,
      data: { url: '/home' }
    })
        │
  User taps notification
        │
        ▼
  'notificationclick' handler:
  → Focus existing open window (if any) and navigate to /home
  → Or open a new window to /home
```

---

## 11. PWA / Service Worker Behaviour

**File:** [`sw.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/src/sw.js), [`vite.config.js`](file:///c:/COLLEGE/Fourth%20Year/Service-Design/vite.config.js)

- **Workbox precaching**: app shell (HTML, CSS, JS chunks) is precached at install time
- **Auto-update**: `skipWaiting()` + `clientsClaim()` — new worker activates immediately
- **Offline capability**: Manual entry only (Voice uses Chrome's server-side recognition; OCR fetches Tesseract WASM from CDN)

---

## 12. Database Schema (Key Tables)

```
profiles
  id → auth.users (PK, FK CASCADE DELETE)
  full_name TEXT
  points INTEGER DEFAULT 0
  created_at TIMESTAMPTZ
  → Created automatically by trigger on auth.users INSERT

categories (read-only reference data, RLS blocks writes)
  id SERIAL PK
  name TEXT UNIQUE
  → Seeded: Snacks, Dairy, Beverages, Ready-to-eat, Other

inventory_items (RLS: user sees only their own rows)
  id UUID PK
  user_id → auth.users (FK CASCADE DELETE)
  name TEXT
  quantity NUMERIC (CHECK > 0)
  unit TEXT (pcs|g|kg|ml|l|packs)
  category_id → categories (FK SET NULL)
  expiry_date DATE
  input_method TEXT (manual|voice|ocr)
  status TEXT (active|used|expired|deleted) DEFAULT 'active'
  used_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
  Indexes: (user_id, status), (expiry_date) WHERE status='active'

push_subscriptions
  user_id → auth.users
  endpoint TEXT UNIQUE
  p256dh TEXT
  auth TEXT
  user_agent TEXT
  expired_at TIMESTAMPTZ

badges (reference data, RLS blocks writes)
user_badges (append-only for the user; no UPDATE/DELETE policy)
```

---

## 13. State Management Summary

| State | Where | Persistence |
|-------|-------|-------------|
| Auth session | Zustand (`authStore`) | Supabase JWT in-memory + cookies |
| Onboarding complete | Zustand + `localStorage` | `expiry-tracker:onboarded` |
| Push dismissed | `localStorage` | `expiry-tracker:push-dismissed` |
| Inventory items | Local `useState` in `Home.jsx` | Fetched from Supabase on mount |
| Active filter / search | Local `useState` in `Home.jsx` | Session only |
| Flash message | `location.state` (React Router) | Single navigation, cleared after 3s |
| Voice transcript (draft) | `location.state` to `/verify` | Single navigation, lost on refresh |
| OCR result (draft) | `location.state` to `/verify` | Single navigation, lost on refresh |

---

## 14. Complete User Journey Summary

```
First visit:
  App loads → Onboarding carousel (3 slides) → "Get started"
  → Login/Signup → Home (empty state)
  → [optionally] Enable push notifications prompt
  → Add item (manual / voice / scan)
  → Home with item list

Returning visit (with session):
  App loads → session restored → Home (inventory list)
  → Search / filter items
  → Mark items as used
  → Add more items

Returning visit (session expired):
  App loads → /login (no flash, just login screen)
  → Sign in again → Home

Push notification (background):
  Notification arrives → tap → app opens/focuses → /home
```

---

## 15. Modules Implemented vs Planned

| Module | Status | Description |
|--------|--------|-------------|
| 0 | ✅ Complete | Vite + React PWA scaffold, Supabase client, Vercel deploy |
| 1 | ✅ Complete | DB schema + RLS |
| 1-hardening | ✅ Complete | `002_hardening.sql` — critical RLS fixes, timestamptz, cascades, trigger, indexes |
| 2 | ✅ Complete | Auth (login/signup/logout) + Onboarding carousel |
| 3 | ✅ Complete | Manual item entry form |
| 4 | ✅ Complete | Inventory list, filter chips, search, mark as used |
| 5 | ✅ Complete | Voice input + Verify screen |
| 6 | ✅ Complete | Camera OCR (phase 1: Canvas preprocess + Tesseract.js) |
| 7 | ✅ Complete | Verify Details screen (shared by voice + OCR, built during Module 5) |
| Hardening audit | ✅ Complete | Error boundaries, localStorage guards, Tesseract worker reuse, route code-splitting, icon fix |
| 8 | 🔲 Planned | Push notification daily digest (Edge Function) |
| 9 | 🔲 Planned | Badges/rewards system (`checkBadgeProgress` stub already wired) |
| 10 | 🔲 Planned | Offline UI, graceful degradation messaging |
| 11 | 🔲 Planned | Google OAuth |
| 12 | 🔲 Planned | OCR phase 2 (barcode / ZXing, OCR.space fallback) |
