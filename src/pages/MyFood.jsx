import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInventory } from '../hooks/useInventory'
import { groupByExpiry, matchesFilter } from '../lib/itemFilters'
import { describeSyncAge } from '../lib/relativeTime'
import { syncRewards } from '../lib/rewards'
import BottomNav from '../components/BottomNav'
import ItemCard from '../components/ItemCard'
import './MyFood.css'

const CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'expired', label: 'Expired' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'later', label: 'Later' },
]

export default function MyFood() {
  const navigate = useNavigate()
  const { items, error, staleSince, online, markUsed } = useInventory()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [markingId, setMarkingId] = useState(null)

  const filtered = useMemo(
    () => (items ?? []).filter((item) => matchesFilter(item, filter, search)),
    [items, filter, search],
  )

  // Grouping headings only help when the list spans bands. Under a specific
  // chip every row is in the same band, so the heading would just restate the
  // chip -- flatten to a single unlabelled group instead.
  const groups = useMemo(
    () =>
      filter === 'all'
        ? groupByExpiry(filtered)
        : [{ band: filter, label: '', items: filtered }],
    [filtered, filter],
  )

  const handleMarkUsed = async (id) => {
    setMarkingId(id)
    const ok = await markUsed(id)
    setMarkingId(null)
    // Using an item before it expires is the action worth the most points, so
    // recompute now rather than waiting for the next visit to Home.
    if (ok) syncRewards()
  }

  return (
    <div className="myfood has-nav">
      <header className="page-header">
        <h1>My Food</h1>
        <p className="page-sub">Keep track of your fridge status</p>
      </header>

      <div className="myfood-body">
        {error && <p className="form-banner error">{error}</p>}
        {!online && (
          <p className="form-banner offline-banner">
            {staleSince
              ? `Offline — showing items last synced ${describeSyncAge(staleSince)}.`
              : 'Offline — changes can’t be saved until you reconnect.'}
          </p>
        )}

        {items === null ? (
          <p className="myfood-loading">Loading your kitchen…</p>
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
            <p className="item-count">
              {items.length} {items.length === 1 ? 'Item' : 'Items'}
            </p>

            <input
              type="search"
              aria-label="Search your items"
              placeholder="Search your items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="filter-chips">
              {CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`filter-chip ${filter === chip.id ? 'active' : ''}`}
                  onClick={() => setFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <p className="no-matches">No items match.</p>
            ) : (
              groups.map((group) => (
                <section key={group.band} className="band">
                  {group.label && <h3 className="band-label">{group.label}</h3>}
                  <ul className="item-list">
                    {group.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onMarkUsed={handleMarkUsed}
                        marking={markingId === item.id}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
