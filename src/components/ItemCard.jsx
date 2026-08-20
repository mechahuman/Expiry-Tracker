import { daysUntil } from '../lib/date'
import './ItemCard.css'

function expiryLabel(days) {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `${days} days left`
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
    <li className="item-card">
      <div className="item-card-main">
        <p className="item-name">{item.name}</p>
        <p className="item-meta">
          {item.quantity} {item.unit}
          {item.category?.name ? ` · ${item.category.name}` : ''}
        </p>
      </div>

      <div className="item-card-side">
        <span className={`expiry-badge ${urgency(days)}`}>{expiryLabel(days)}</span>
        <button
          type="button"
          className="btn-text mark-used"
          onClick={() => onMarkUsed(item.id)}
          disabled={marking}
        >
          {marking ? 'Marking…' : 'Mark as used'}
        </button>
      </div>
    </li>
  )
}
