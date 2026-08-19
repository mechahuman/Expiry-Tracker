import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import Onboarding from './pages/Onboarding'
import Login from './pages/Login'
import Home from './pages/Home'

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
