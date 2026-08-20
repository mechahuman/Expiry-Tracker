import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { daysUntil } from '../lib/date'
import { checkBadgeProgress } from '../lib/badges'
import ItemCard from '../components/ItemCard'
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

  const fetchItems = useCallback(() => {
    if (!session) return
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
        if (error) setItemsError(error.message)
        else {
          setItemsError('')
          setItems(data ?? [])
        }
      })
  }, [session])

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

  useEffect(fetchItems, [fetchItems])

  // Arriving back from /add with a flash message means an item was just
  // saved -- that's the signal to refetch, not a route remount (Home stays
  // mounted across the /add round-trip, so its initial-load effect won't fire
  // again on its own).
  useEffect(() => {
    if (!flash) return
    fetchItems()
    const timer = setTimeout(() => {
      setFlash('')
      navigate('.', { replace: true, state: {} })
    }, 3000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash])

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
    checkBadgeProgress(session.user.id)
  }

  const categoryChips = useMemo(() => {
    const seen = new Map()
    for (const it of items ?? []) {
      if (it.category_id && it.category?.name && !seen.has(it.category_id)) {
        seen.set(it.category_id, it.category.name)
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [items])

  const filteredItems = useMemo(() => {
    if (!items) return []
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      const days = daysUntil(it.expiry_date)
      if (filter === 'soon' && !(days <= 7)) return false
      if (filter === 'expired' && !(days < 0)) return false
      if (typeof filter === 'number' && it.category_id !== filter) return false
      if (q && !it.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, filter, search])

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
          <div className="home-controls">
            <input
              type="search"
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
