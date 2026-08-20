import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import './Home.css'

export default function Home() {
  const session = useAuthStore((s) => s.session)
  const signOut = useAuthStore((s) => s.signOut)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const [flash, setFlash] = useState(location.state?.flash ?? '')

  // Clear the flash after a few seconds, and scrub it from history state so
  // it doesn't reappear if the user later navigates back to /home.
  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => {
      setFlash('')
      navigate('.', { replace: true, state: {} })
    }, 3000)
    return () => clearTimeout(timer)
  }, [flash, navigate])

  // Reading the profile row here isn't just for display: it proves end-to-end
  // that the on_auth_user_created trigger fired for this account and that RLS
  // lets a user read their own row. If this errors, one of those two is broken.
  useEffect(() => {
    if (!session) return

    supabase
      .from('profiles')
      .select('full_name, points')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setProfileError(error.message)
        else if (!data) setProfileError('No profile row found for this account.')
        else setProfile(data)
      })
  }, [session])

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h2>Your kitchen</h2>
          <p className="home-email">{session?.user?.email}</p>
        </div>
        <button type="button" className="btn-text" onClick={signOut}>
          Log out
        </button>
      </header>

      {flash && <p className="form-banner notice home-flash">{flash}</p>}

      <div className="empty-state">
        <span className="empty-emoji" role="presentation">
          🛒
        </span>
        <h2>Nothing here yet</h2>
        <p>Items you add will show up here with their expiry dates.</p>
        {/* The list itself (Module 4) doesn't exist yet, so a saved item has
            nowhere to render -- this button works, it just has no visible
            effect beyond the flash message until Module 4 lands. */}
        <button type="button" className="btn-primary" onClick={() => navigate('/add')}>
          Add your first item
        </button>
      </div>

      <footer className="home-footer">
        {profileError ? (
          <span className="profile-error">Profile error: {profileError}</span>
        ) : (
          <span>Points: {profile ? profile.points : '…'}</span>
        )}
      </footer>
    </div>
  )
}
