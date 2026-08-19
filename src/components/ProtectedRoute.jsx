import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

/**
 * Gates a route behind an active session.
 *
 * The `loading` check is what makes refresh-on-a-protected-page work: Supabase
 * restores the session asynchronously, so redirecting while it's still
 * undetermined would bounce a legitimately logged-in user out to /login.
 */
export default function ProtectedRoute({ children }) {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)

  if (loading) return <div className="splash">Loading…</div>
  if (!session) return <Navigate to="/login" replace />

  return children
}
