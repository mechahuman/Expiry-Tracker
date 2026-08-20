import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import ItemForm from '../components/ItemForm'
import { useAuthStore } from '../store/authStore'
import { checkBadgeProgress } from '../lib/badges'
import './VerifyItem.css'

/**
 * The safety net between an automated capture and the database. Voice
 * (Module 5) and, later, OCR (Module 6) both land here rather than saving
 * directly, so a misheard word or a bad OCR read is always a correction
 * rather than a wrong row.
 */
export default function VerifyItem() {
  const navigate = useNavigate()
  const location = useLocation()
  const session = useAuthStore((s) => s.session)

  const { parsed, detected, transcript, inputMethod, warning } = location.state ?? {}

  // Nothing to verify (deep link, refresh, or a back-nav after saving) --
  // there's no draft in memory to recover, so start over rather than showing
  // an empty "verify" screen.
  if (!parsed) return <Navigate to="/home" replace />

  const RETRY_PATHS = { voice: '/voice', ocr: '/scan' }
  const retryPath = RETRY_PATHS[inputMethod] ?? '/add'

  const handleSaved = (item) => {
    checkBadgeProgress(session.user.id)
    navigate('/home', { state: { flash: `"${item.name}" added` } })
  }

  return (
    <div className="verify">
      <header className="verify-header">
        <button type="button" className="btn-text" onClick={() => navigate('/home')}>
          Cancel
        </button>
        <h2>Check the details</h2>
        <span className="header-spacer" aria-hidden="true" />
      </header>

      <div className="verify-body">
        {transcript && (
          <p className="verify-transcript">
            {inputMethod === 'voice' ? (
              <>
                You said: <em>“{transcript}”</em>
              </>
            ) : (
              transcript
            )}
          </p>
        )}
        {warning && <p className="form-banner error verify-warning">{warning}</p>}
        <p className="verify-hint">
          Tagged fields were filled in automatically — check them before saving. Anything blank
          wasn’t clear enough to guess.
        </p>

        <ItemForm
          initialValues={parsed}
          detectedFields={detected ?? {}}
          inputMethod={inputMethod ?? 'manual'}
          submitLabel="Save item"
          onSaved={handleSaved}
        />

        <button
          type="button"
          className="btn-text verify-retry"
          onClick={() => navigate(retryPath, { replace: true })}
        >
          Discard and try again
        </button>
      </div>
    </div>
  )
}
