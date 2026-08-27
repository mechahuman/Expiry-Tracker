import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInventory } from '../hooks/useInventory'
import { expiryBand, groupByExpiry } from '../lib/itemFilters'
import { syncRewards } from '../lib/rewards'
import BottomNav from '../components/BottomNav'
import ItemCard from '../components/ItemCard'
import './Alerts.css'

/**
 * Everything that needs attention: expired, today, and this week.
 *
 * Deliberately partial against the design, which also shows a per-item
 * "Suggested action: mash into guacamole!" line. That copy has to come from
 * somewhere -- a curated map or a model -- and inventing it per category would
 * produce confident nonsense for anything unrecognised. Tracked as follow-up
 * rather than faked.
 */
export default function Alerts() {
  const { items, error, markUsed } = useInventory()
  const navigate = useNavigate()
  const [markingId, setMarkingId] = useState(null)

  // "later" never appears here -- an item three weeks out isn't an alert.
  const groups = useMemo(
    () => groupByExpiry((items ?? []).filter((it) => expiryBand(it) !== 'later')),
    [items],
  )

  const handleMarkUsed = async (id) => {
    setMarkingId(id)
    const ok = await markUsed(id)
    setMarkingId(null)
    if (ok) syncRewards()
  }

  return (
    <div className="alerts has-nav">
      <header className="page-header">
        <h1>Alerts</h1>
        <p className="page-sub">What needs eating first</p>
      </header>

      <div className="alerts-body">
        {error && <p className="form-banner error">{error}</p>}

        {items === null ? (
          <p className="alerts-loading">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="empty-state card">
            <span className="empty-emoji" role="presentation">
              ✅
            </span>
            <h2>All clear</h2>
            <p>Nothing is expiring in the next week. Nice work.</p>
            <button type="button" className="btn-secondary" onClick={() => navigate('/food')}>
              View all food
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.band} className="band">
              <h3 className="band-label">
                {group.label} {group.band === 'expired' ? '🚨' : '⚠️'}
              </h3>
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
      </div>

      <BottomNav />
    </div>
  )
}
