import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useInventory } from '../hooks/useInventory'
import { itemEmoji, mostUrgent, summarise } from '../lib/dashboardStats'
import { describeNewBadges, syncRewards } from '../lib/rewards'
import { describeSyncAge } from '../lib/relativeTime'
import { daysUntil } from '../lib/date'
import BottomNav from '../components/BottomNav'
import Logo from '../components/Logo'
import PushPrompt from '../components/PushPrompt'
import './Home.css'

/** "Use by: Today" / "Use by: in 3 days" / "Expired 2 days ago". */
function useByLabel(days) {
  if (days < 0) return `Expired ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago`
  if (days === 0) return 'Use by: Today'
  if (days === 1) return 'Use by: Tomorrow'
  return `Use by: in ${days} days`
}

/** Short date for a card, e.g. "Oct 26". */
function shortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Home() {
  const session = useAuthStore((s) => s.session)
  const signOut = useAuthStore((s) => s.signOut)
  const navigate = useNavigate()
  const location = useLocation()

  const { items, error: itemsError, staleSince, online } = useInventory()

  const [points, setPoints] = useState(null)
  const [savedThisWeek, setSavedThisWeek] = useState(null)
  const [flash, setFlash] = useState(location.state?.flash ?? '')
  const [badgeFlash, setBadgeFlash] = useState('')

  // Re-evaluates points and badges server-side, then reflects the result.
  // Safe to call redundantly -- points are recomputed, never incremented.
  const runSync = useCallback(async () => {
    const result = await syncRewards()
    if (!result) return
    setPoints(result.points)

    const message = describeNewBadges(result.newly_earned)
    if (message) setBadgeFlash(message)
  }, [])

  useEffect(() => {
    if (!session) return
    runSync()
  }, [session, runSync])

  // The "you saved N items this week" footer. A count-only query -- the rows
  // themselves are never needed, just the total.
  useEffect(() => {
    if (!session) return
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    supabase
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('status', 'used')
      .gte('used_at', weekAgo)
      .then(({ count, error }) => {
        // Left null on failure, which hides the card. A wrong number here
        // would undermine the one screen meant to build trust in the tally.
        if (!error) setSavedThisWeek(count ?? 0)
      })
  }, [session])

  // Badges get their own banner rather than sharing the item-added flash --
  // saving an item and unlocking something are two separate pieces of news.
  useEffect(() => {
    if (!badgeFlash) return undefined
    const timer = setTimeout(() => setBadgeFlash(''), 5000)
    return () => clearTimeout(timer)
  }, [badgeFlash])

  // Clear the flash after a few seconds and scrub it from history state, so it
  // doesn't reappear if the user navigates back to /home later.
  useEffect(() => {
    if (!flash) return undefined
    const timer = setTimeout(() => {
      setFlash('')
      navigate('.', { replace: true, state: {} })
    }, 3000)
    return () => clearTimeout(timer)
  }, [flash, navigate])

  const stats = useMemo(() => summarise(items), [items])
  const urgent = useMemo(() => mostUrgent(items), [items])
  const recent = useMemo(() => (items ?? []).slice(0, 3), [items])

  // Prefer the name the user signed up with; the email's local part is a
  // reasonable stand-in, and "there" keeps the greeting grammatical if neither
  // is available rather than rendering "Hi,  👋".
  const greetingName =
    session?.user?.user_metadata?.full_name?.split(' ')[0] ??
    session?.user?.email?.split('@')[0] ??
    'there'

  return (
    <div className="home has-nav">
      <header className="brand-header">
        <h1 className="brand-mark">
          <Logo tone="light" showTagline />
        </h1>
        {/* The design has no settings or profile screen, so sign-out lives
            here -- the alternative is no way out of the account at all. */}
        <button type="button" className="sign-out" onClick={signOut}>
          Log out
        </button>
      </header>

      <div className="home-body">
        <section className="greeting">
          <h2>Hi, {greetingName} 👋</h2>
          <p>Let’s eat fresh and waste less!</p>
        </section>

        {flash && <p className="form-banner notice">{flash}</p>}
        {badgeFlash && <p className="form-banner notice badge-flash">{badgeFlash}</p>}
        {itemsError && <p className="form-banner error">{itemsError}</p>}
        {!online && (
          <p className="form-banner offline-banner">
            {staleSince
              ? `Offline — showing items last synced ${describeSyncAge(staleSince)}.`
              : 'Offline — changes can’t be saved until you reconnect.'}
          </p>
        )}

        {items === null ? (
          <p className="home-loading">Loading your kitchen…</p>
        ) : items.length === 0 ? (
          <div className="empty-state card">
            <span className="empty-emoji" role="presentation">
              🛒
            </span>
            <h2>Nothing here yet</h2>
            <p>Items you add will show up here with their expiry dates.</p>
            <button type="button" className="btn-primary" onClick={() => navigate('/add')}>
              Add Food
            </button>
          </div>
        ) : (
          <>
            {urgent && <PriorityCard item={urgent} onView={() => navigate('/food')} />}

            <div className="stat-row">
              <Stat value={stats.total} label="Total Food" />
              <Stat value={stats.soon} label="Expiring Soon" tone="warning" />
              <Stat value={stats.expired} label="Expired" tone="danger" />
            </div>

            {/* Only offered once there's actually something worth reminding
                about -- see the note in PushPrompt about spending the browser's
                one permission prompt carefully. */}
            <PushPrompt userId={session.user.id} />

            <section className="section">
              <div className="section-head">
                <h3>Recently Added 🥬</h3>
                <button type="button" className="btn-text" onClick={() => navigate('/food')}>
                  View All
                </button>
              </div>

              <ul className="mini-list">
                {recent.map((item) => (
                  <MiniItem key={item.id} item={item} />
                ))}
              </ul>
            </section>

            {savedThisWeek > 0 && (
              <section className="cheer card">
                <p className="cheer-title">GREAT JOB!</p>
                <p className="cheer-body">
                  You saved {savedThisWeek} {savedThisWeek === 1 ? 'item' : 'items'} this week 🎉
                </p>
              </section>
            )}

            {points !== null && (
              <button type="button" className="points-link" onClick={() => navigate('/rewards')}>
                <span>Points: {points}</span>
                <span className="points-link-cta">View progress →</span>
              </button>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

/** The single most urgent item, surfaced above everything else. */
function PriorityCard({ item, onView }) {
  const days = daysUntil(item.expiry_date)
  const expired = days < 0

  return (
    <section className={`priority-card ${expired ? 'expired' : ''}`}>
      <span className="priority-emoji" role="presentation">
        {itemEmoji(item)}
      </span>
      <div className="priority-main">
        <p className="priority-name">{item.name}</p>
        <p className="priority-when">{useByLabel(days)}</p>
      </div>
      <div className="priority-side">
        <span className="priority-flag">{expired ? 'Expired' : 'High Priority'}</span>
        <button type="button" className="priority-cta" onClick={onView}>
          View Items
        </button>
      </div>
    </section>
  )
}

function Stat({ value, label, tone = '' }) {
  return (
    <div className={`stat ${tone}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function MiniItem({ item }) {
  const days = daysUntil(item.expiry_date)
  const tone = days < 0 ? 'danger' : days <= 2 ? 'warning' : 'ok'

  return (
    <li className="mini-item card">
      <span className="mini-emoji" role="presentation">
        {itemEmoji(item)}
      </span>
      <div className="mini-main">
        <p className="mini-name">{item.name}</p>
        <p className="mini-meta">
          {item.category?.name ?? 'Other'} · Exp: {shortDate(item.expiry_date)}
        </p>
      </div>
      <span className={`mini-badge ${tone}`}>
        {days < 0 ? 'Expired' : days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`}
      </span>
    </li>
  )
}
