import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import './Home.css'

export default function Home() {
  const session = useAuthStore((s) => s.session)
  const signOut = useAuthStore((s) => s.signOut)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')

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

      <div className="empty-state">
        <span className="empty-emoji" role="presentation">
          🛒
        </span>
        <h2>Nothing here yet</h2>
        <p>Items you add will show up here with their expiry dates.</p>
        {/* Wired up in Module 3 (Manual Entry). */}
        <button type="button" className="btn-primary" disabled>
          Add your first item
        </button>
        <p className="coming-soon">Adding items arrives in the next update.</p>
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
