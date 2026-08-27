import { daysUntil } from '../lib/date'
import { itemEmoji } from '../lib/dashboardStats'
import './ItemCard.css'

function expiryLabel(days) {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Exp: Today'
  if (days === 1) return 'Exp: Tomorrow'
  return `Exp: ${days} days left`
}

/** Compact badge text -- the card already spells the date out beside it. */
function badgeLabel(days) {
  if (days < 0) return 'Expired'
  if (days === 0) return 'Today'
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

// Thresholds match the roadmap: red <=2 days, orange <=7 days, green beyond.
// Already-expired (negative days) is folded into "urgent" (red).
function urgency(days) {
  if (days <= 2) return 'urgent'
  if (days <= 7) return 'soon'
  return 'ok'
}

export default function ItemCard({ item, onMarkUsed, marking }) {
  const days = daysUntil(item.expiry_date)

  return (
    <li className="item-card card">
      <span className="item-emoji" role="presentation">
        {itemEmoji(item)}
      </span>

      <div className="item-card-main">
        <p className="item-name">
          {item.name}
          <span className="item-qty">
            {' '}
            ({item.quantity} {item.unit})
          </span>
        </p>
        <p className="item-meta">
          {item.category?.name ?? 'Other'} · {expiryLabel(days)}
        </p>
        <button
          type="button"
          className="mark-used"
          onClick={() => onMarkUsed(item.id)}
          disabled={marking}
        >
          {marking ? 'Marking…' : 'Mark as used'}
        </button>
      </div>

      <span className={`expiry-badge ${urgency(days)}`}>{badgeLabel(days)}</span>
    </li>
  )
}
