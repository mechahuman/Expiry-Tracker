import { useState } from 'react'
import { enablePushNotifications, getPermission, isPushSupported } from '../lib/push'
import './PushPrompt.css'

const DISMISSED_KEY = 'expiry-tracker:push-dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {
    // Storage blocked (Safari private mode). Showing the card again next
    // visit is a better failure than crashing, so treat it as not dismissed.
    return false
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true')
  } catch {
    /* Non-fatal -- the card will just reappear next visit. */
  }
}

/**
 * Asks for notification permission from inside the app first, rather than
 * firing the browser's own prompt on load. Deliberate: a denied browser
 * permission is close to unrecoverable (the user has to dig through site
 * settings), so it's worth only spending the one prompt on someone who has
 * already said yes here.
 *
 * Home renders this only once the user actually has items -- there's no point
 * offering reminders about an empty kitchen.
 */
export default function PushPrompt({ userId }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  const permission = getPermission()

  // Nothing to ask for: unsupported, already granted, or already blocked at
  // the browser level (which this card cannot undo).
  if (!isPushSupported() || permission !== 'default' || dismissed) return null

  const dismiss = () => {
    persistDismissed()
    setDismissed(true)
  }

  const enable = async () => {
    setBusy(true)
    const { ok, reason } = await enablePushNotifications(userId)
    setBusy(false)

    if (ok) {
      persistDismissed()
      setDismissed(true)
      return
    }
    setResult(
      reason === 'denied'
        ? 'Notifications are blocked for this site. You can re-enable them in your browser settings.'
        : "Couldn't turn on reminders. Try again in a moment.",
    )
  }

  return (
    <section className="push-prompt">
      <div>
        <h2>Get reminded before food expires</h2>
        <p>A single daily nudge about anything going off in the next three days.</p>
        {result && <p className="push-prompt-result">{result}</p>}
      </div>
      <div className="push-prompt-actions">
        <button type="button" className="btn-primary" onClick={enable} disabled={busy}>
          {busy ? 'Enabling…' : 'Turn on reminders'}
        </button>
        <button type="button" className="btn-text" onClick={dismiss}>
          Not now
        </button>
      </div>
    </section>
  )
}
