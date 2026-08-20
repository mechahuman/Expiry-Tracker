import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { categoriesInUse, matchesFilter } from '../lib/itemFilters'
import { checkBadgeProgress } from '../lib/badges'
import ItemCard from '../components/ItemCard'
import PushPrompt from '../components/PushPrompt'
import './Home.css'

export default function Home() {
  const session = useAuthStore((s) => s.session)
  const signOut = useAuthStore((s) => s.signOut)
  const navigate = useNavigate()
  const location = useLocation()

  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')

  // null = still loading (distinct from "loaded, zero items").
  const [items, setItems] = useState(null)
  const [itemsError, setItemsError] = useState('')
  const [markingId, setMarkingId] = useState(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'soon' | 'expired' | <category_id>

  const [flash, setFlash] = useState(location.state?.flash ?? '')

  // Returns a cancel function so callers can ignore a response that lands
  // after the component has gone.
  const fetchItems = useCallback(() => {
    if (!session) return undefined
    let cancelled = false

    // .eq('user_id', ...) is redundant with RLS (which already scopes every
    // query to the caller) but it's what lets this query match the
    // (user_id, status) index added in 002_hardening.sql, and it documents
    // intent inline rather than relying on RLS to explain itself.
    supabase
      .from('inventory_items')
      .select('id, name, quantity, unit, expiry_date, category_id, category:categories(name)')
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .order('expiry_date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setItemsError(error.message)
        else {
          setItemsError('')
          setItems(data ?? [])
        }
      })

    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false

    supabase
      .from('profiles')
      .select('full_name, points')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setProfileError(error.message)
        else if (!data) setProfileError('No profile row found for this account.')
        else setProfile(data)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  // Home unmounts whenever the route changes, so this runs again on the way
  // back from /add, /voice or /scan -- a freshly saved item is already picked
  // up here and needs no separate refetch.
  useEffect(fetchItems, [fetchItems])

  // Clear the flash after a few seconds and scrub it from history state, so
  // it doesn't reappear if the user navigates back to /home later.
  useEffect(() => {
    if (!flash) return undefined
    const timer = setTimeout(() => {
      setFlash('')
      navigate('.', { replace: true, state: {} })
    }, 3000)
    return () => clearTimeout(timer)
  }, [flash, navigate])

  const handleMarkUsed = async (id) => {
    setMarkingId(id)
    const { error } = await supabase
      .from('inventory_items')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', id)
    setMarkingId(null)

    if (error) {
      setItemsError(error.message)
      return
    }
    setItems((prev) => prev.filter((it) => it.id !== id))
    // Fire-and-forget: badge progress must never block or break the action
    // the user actually took. See the contract note in lib/badges.js.
    checkBadgeProgress(session.user.id).catch(() => {})
  }

  const categoryChips = useMemo(() => categoriesInUse(items), [items])

  const filteredItems = useMemo(
    () => (items ?? []).filter((item) => matchesFilter(item, filter, search)),
    [items, filter, search],
  )

  const hasAnyItems = items && items.length > 0

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
      {itemsError && <p className="form-banner error home-flash">{itemsError}</p>}

      {items === null ? (
        <p className="home-loading">Loading your kitchen…</p>
      ) : !hasAnyItems ? (
        <div className="empty-state">
          <span className="empty-emoji" role="presentation">
            🛒
          </span>
          <h2>Nothing here yet</h2>
          <p>Items you add will show up here with their expiry dates.</p>
          <div className="add-actions">
            <button type="button" className="btn-primary" onClick={() => navigate('/add')}>
              Add your first item
            </button>
            <div className="add-actions-row">
              <button type="button" className="btn-secondary" onClick={() => navigate('/voice')}>
                🎙️ Voice
              </button>
              <button type="button" className="btn-secondary" onClick={() => navigate('/scan')}>
                📷 Scan
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Only offered once there's actually something worth reminding
              about -- see the note in PushPrompt about spending the browser's
              one permission prompt carefully. */}
          <PushPrompt userId={session.user.id} />

          <div className="home-controls">
            <input
              type="search"
              aria-label="Search your items"
              placeholder="Search your items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="filter-chips">
              <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
              <FilterChip
                label="Expiring soon"
                active={filter === 'soon'}
                onClick={() => setFilter('soon')}
              />
              <FilterChip
                label="Expired"
                active={filter === 'expired'}
                onClick={() => setFilter('expired')}
              />
              {categoryChips.map((c) => (
                <FilterChip
                  key={c.id}
                  label={c.name}
                  active={filter === c.id}
                  onClick={() => setFilter(c.id)}
                />
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <p className="no-matches">No items match.</p>
          ) : (
            <ul className="item-list">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onMarkUsed={handleMarkUsed}
                  marking={markingId === item.id}
                />
              ))}
            </ul>
          )}

          <div className="add-actions fab">
            <button type="button" className="btn-primary" onClick={() => navigate('/add')}>
              + Add item
            </button>
            <div className="add-actions-row">
              <button type="button" className="btn-secondary" onClick={() => navigate('/voice')}>
                🎙️ Voice
              </button>
              <button type="button" className="btn-secondary" onClick={() => navigate('/scan')}>
                📷 Scan
              </button>
            </div>
          </div>
        </>
      )}

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

function FilterChip({ label, active, onClick }) {
  return (
    <button type="button" className={`filter-chip ${active ? 'active' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}
