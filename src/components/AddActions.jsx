import { useNavigate } from 'react-router-dom'
import './AddActions.css'

/**
 * The three ways in. Shared because it appears in both empty states, and the
 * offline handling shouldn't have to be kept in sync across copies.
 *
 * Voice and Scan are disabled offline rather than left to fail: Chrome's
 * speech recognition runs server-side and Tesseract fetches its WASM core from
 * a CDN, so neither can work without a connection. Manual entry stays enabled,
 * since the form itself explains the situation and it's the one path that
 * could plausibly work offline later.
 */
export default function AddActions({ primaryLabel = '+ Add item', online, className = '' }) {
  const navigate = useNavigate()

  return (
    <div className={`add-actions ${className}`.trim()}>
      <button type="button" className="btn-primary" onClick={() => navigate('/add')}>
        {primaryLabel}
      </button>
      <div className="add-actions-row">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/voice')}
          disabled={!online}
        >
          🎙️ Voice
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/scan')}
          disabled={!online}
        >
          📷 Scan
        </button>
      </div>
      {!online && <p className="capture-offline-note">Voice and Scan need a connection.</p>}
    </div>
  )
}
