import { useNavigate } from 'react-router-dom'
import ItemForm from '../components/ItemForm'
import { useAuthStore } from '../store/authStore'
import { checkBadgeProgress } from '../lib/badges'
import './AddItem.css'

export default function AddItem() {
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)

  const handleSaved = (item) => {
    // Fire-and-forget -- see the contract note in lib/badges.js.
    checkBadgeProgress(session.user.id).catch(() => {})
    navigate('/home', { state: { flash: `"${item.name}" added` } })
  }

  return (
    <div className="add-item">
      <header className="add-item-header">
        <button type="button" className="btn-text" onClick={() => navigate('/home')}>
          Cancel
        </button>
        <h2>Add item</h2>
        <span className="header-spacer" aria-hidden="true" />
      </header>

      <div className="add-item-body">
        <ItemForm inputMethod="manual" onSaved={handleSaved} />
      </div>
    </div>
  )
}
