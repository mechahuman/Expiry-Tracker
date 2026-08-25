import { useNavigate } from 'react-router-dom'
import ItemForm from '../components/ItemForm'
import './AddItem.css'

export default function AddItem() {
  const navigate = useNavigate()

  const handleSaved = (item) => {
    // No rewards call here on purpose. Navigating unmounts this screen and
    // mounts Home, which syncs rewards itself -- doing it from a component
    // that's about to disappear just adds a race for no benefit.
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
