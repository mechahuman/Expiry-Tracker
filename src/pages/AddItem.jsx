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
        {/* Back to the chooser rather than Home: this screen is reached
            through it, and from "type it instead" on Voice and Scan, so the
            chooser is the sensible step back from all three. */}
        <button type="button" className="btn-text" onClick={() => navigate('/add')}>
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
