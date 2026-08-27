import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'

// Eager: these three are the first thing anyone sees, so splitting them would
// only add a loading flash to the critical path.
import Onboarding from './pages/Onboarding'
import Login from './pages/Login'
import Home from './pages/Home'

const RELOAD_FLAG = 'expiry-tracker:chunk-reload'

/**
 * lazy(), but tolerant of a chunk that has vanished.
 *
 * Chunk filenames are content-hashed, so a tab left open across a deploy asks
 * for a file that no longer exists and the import rejects. The service worker
 * calling skipWaiting() makes this likelier, not rarer. Reloading picks up the
 * new build; the sessionStorage flag stops a genuinely broken chunk from
 * turning that into a reload loop.
 */
function lazyRoute(factory) {
  return lazy(() =>
    factory()
      .then((module) => {
        try {
          sessionStorage.removeItem(RELOAD_FLAG)
        } catch {
          /* Storage unavailable -- the reload guard just won't persist. */
        }
        return module
      })
      .catch((error) => {
        let alreadyTried = true
        try {
          alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === '1'
          if (!alreadyTried) sessionStorage.setItem(RELOAD_FLAG, '1')
        } catch {
          /* Can't track attempts, so don't risk looping -- fall through. */
        }

        if (!alreadyTried) {
          window.location.reload()
          // Never settles: the reload takes over before React renders again.
          return new Promise(() => {})
        }
        throw error
      }),
  )
}

// Lazy: the capture and entry screens, none of which a user necessarily opens
// in a session. Splitting them keeps their weight -- and, through them,
// chrono-node and tesseract.js -- out of the initial download.
const MyFood = lazyRoute(() => import('./pages/MyFood'))
const Alerts = lazyRoute(() => import('./pages/Alerts'))
const AddItem = lazyRoute(() => import('./pages/AddItem'))
const VoiceInput = lazyRoute(() => import('./pages/VoiceInput'))
const ScanItem = lazyRoute(() => import('./pages/ScanItem'))
const VerifyItem = lazyRoute(() => import('./pages/VerifyItem'))
const Rewards = lazyRoute(() => import('./pages/Rewards'))

/** Decides where "/" lands, based on onboarding + session state. */
function RootRedirect() {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)
  const hasOnboarded = useAuthStore((s) => s.hasOnboarded)

  if (loading) return <div className="splash">Loading…</div>
  if (!hasOnboarded) return <Navigate to="/onboarding" replace />
  return <Navigate to={session ? '/home' : '/login'} replace />
}

export default function App() {
  const setSession = useAuthStore((s) => s.setSession)

  useEffect(() => {
    // Restore any session persisted from a previous visit...
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    // ...then keep the store in sync for the rest of the app's lifetime.
    // This is what makes login, logout, and token refresh propagate everywhere
    // without any component needing to know about them.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))

    return () => subscription.unsubscribe()
  }, [setSession])

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="splash">Loading…</div>}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/food"
            element={
              <ProtectedRoute>
                <MyFood />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <Alerts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add"
            element={
              <ProtectedRoute>
                <AddItem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/voice"
            element={
              <ProtectedRoute>
                <VoiceInput />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan"
            element={
              <ProtectedRoute>
                <ScanItem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/verify"
            element={
              <ProtectedRoute>
                <VerifyItem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rewards"
            element={
              <ProtectedRoute>
                <Rewards />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
