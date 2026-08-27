import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { categoriesInUse, matchesFilter } from '../lib/itemFilters'
import { describeNewBadges, syncRewards } from '../lib/rewards'
import { loadItems, saveItems } from '../lib/offlineCache'
import { describeSyncAge } from '../lib/relativeTime'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
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
  const [badgeFlash, setBadgeFlash] = useState('')

  const online = useOnlineStatus()
  // Set only when the list on screen came from cache rather than the network.
  const [staleSince, setStaleSince] = useState(null)

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

        if (!error) {
          setItemsError('')
          setStaleSince(null)
          setItems(data ?? [])
          // Keeps the offline fallback current. Only ever written from a
          // successful response, so the cache can't be poisoned by a failure.
          saveItems(session.user.id, data ?? [])
          return
        }

        // A failed fetch with no connection isn't really an error to report --
        // it's the expected outcome, and the cached list is a better answer
        // than an empty screen. A failure while online is a real error.
        const cached = loadItems(session.user.id)
        if (cached) {
          setItems(cached.items)
          setStaleSince(cached.savedAt)
          setItemsError('')
        } else {
          setItemsError(error.message)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session])

  // Re-evaluates points and badges server-side, then reflects the result.
  // Replaces what used to be a plain read of profiles.points: the same call
  // now both recalculates the score and returns it, so there's no second query
  // and no window where the footer shows a stale total.
  const runSync = useCallback(async () => {
    const result = await syncRewards()
    if (!result) {
      setProfileError('Could not load your points.')
      return
    }
    setProfileError('')
    setProfile({ points: result.points })

    const message = describeNewBadges(result.newly_earned)
    if (message) setBadgeFlash(message)
  }, [])

  useEffect(() => {
    if (!session) return
    runSync()
  }, [session, runSync])

  // Badges get their own banner rather than sharing the item-added flash --
  // saving an item and unlocking something are two separate pieces of news and
  // one shouldn't overwrite the other.
  useEffect(() => {
    if (!badgeFlash) return undefined
    const timer = setTimeout(() => setBadgeFlash(''), 5000)
    return () => clearTimeout(timer)
  }, [badgeFlash])

  // Home unmounts whenever the route changes, so this runs again on the way
  // back from /add, /voice or /scan -- a freshly saved item is already picked
  // up here and needs no separate refetch.
  useEffect(fetchItems, [fetchItems])

  // Coming back online while showing cached data: refresh silently, so the
  // stale banner clears itself rather than waiting for the user to navigate.
  useEffect(() => {
    if (!online || !staleSince) return undefined
    return fetchItems()
  }, [online, staleSince, fetchItems])

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
    // Home doesn't remount for this, so the sync that normally happens on
    // mount has to be triggered explicitly. Using an item before it expires is
    // the action worth the most points, so the footer should reflect it now.
    runSync()
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
      {badgeFlash && <p className="form-banner notice home-flash badge-flash">{badgeFlash}</p>}
      {itemsError && <p className="form-banner error home-flash">{itemsError}</p>}
      {!online && (
        <p className="form-banner home-flash offline-banner">
          {staleSince
            ? `Offline — showing items last synced ${describeSyncAge(staleSince)}.`
            : 'Offline — changes can’t be saved until you reconnect.'}
        </p>
      )}

      {items === null ? (
        <p className="home-loading">Loading your kitchen…</p>
      ) : !hasAnyItems ? (
        <div className="empty-state">
          <span className="empty-emoji" role="presentation">
            🛒
          </span>
          <h2>Nothing here yet</h2>
          <p>Items you add will show up here with their expiry dates.</p>
          <AddActions primaryLabel="Add your first item" online={online} onGo={navigate} />
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

          <AddActions
            primaryLabel="+ Add item"
            online={online}
            onGo={navigate}
            className="fab"
          />
        </>
      )}

      <footer className="home-footer">
        {profileError ? (
          <span className="profile-error">{profileError}</span>
        ) : (
          // Doubles as the entry point to Rewards -- the score is where you'd
          // instinctively tap to find out more about it, so it saves adding
          // navigation chrome for a single destination.
          <button type="button" className="points-link" onClick={() => navigate('/rewards')}>
            <span>Points: {profile ? profile.points : '…'}</span>
            <span className="points-link-cta">View rewards →</span>
          </button>
        )}
      </footer>
    </div>
  )
}

/**
 * The three ways in. Extracted because it appears twice -- in the empty state
 * and above the list -- and the offline handling shouldn't have to be kept in
 * sync across two copies.
 *
 * Voice and Scan are disabled offline rather than left to fail: Chrome's
 * speech recognition runs server-side and Tesseract fetches its WASM core from
 * a CDN, so neither can work without a connection. Manual entry stays enabled,
 * since the form itself explains the situation and it's the one path that
 * could plausibly work offline later.
 */
function AddActions({ primaryLabel, online, onGo, className = '' }) {
  return (
    <div className={`add-actions ${className}`.trim()}>
      <button type="button" className="btn-primary" onClick={() => onGo('/add')}>
        {primaryLabel}
      </button>
      <div className="add-actions-row">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onGo('/voice')}
          disabled={!online}
        >
          🎙️ Voice
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onGo('/scan')}
          disabled={!online}
        >
          📷 Scan
        </button>
      </div>
      {!online && <p className="capture-offline-note">Voice and Scan need a connection.</p>}
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
