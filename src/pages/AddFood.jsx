import { useNavigate } from 'react-router-dom'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import BottomNav from '../components/BottomNav'
import './AddFood.css'

/**
 * The three ways into the app, as a chooser screen.
 *
 * Replaces the AddActions block that used to sit in the Home and My Food empty
 * states. That placement meant Voice and Scan were unreachable the moment a
 * user had any items at all, since the empty states stopped rendering.
 *
 * `offline` on an option means it genuinely cannot work without a connection,
 * not that we'd rather it didn't: Chrome's speech recognition runs server-side,
 * and Tesseract fetches its WASM core from a CDN. Manual entry has no such
 * dependency, so it stays available and the form itself explains the rest.
 */
const OPTIONS = [
  {
    to: '/scan',
    emoji: '📄',
    title: 'Scan Receipt',
    body: 'Capture and extract items from a receipt',
    needsNetwork: true,
  },
  {
    to: '/voice',
    emoji: '🎙️',
    title: 'Voice Input',
    body: 'Tell us what you bought',
    needsNetwork: true,
  },
  {
    to: '/add/manual',
    emoji: '✍️',
    title: 'Manual Entry',
    body: 'Enter food details manually',
    needsNetwork: false,
  },
]

export default function AddFood() {
  const navigate = useNavigate()
  const online = useOnlineStatus()

  const anyDisabled = OPTIONS.some((o) => o.needsNetwork) && !online

  return (
    <div className="add-food has-nav">
      <header className="page-header">
        <h1>Add Food</h1>
        <p className="page-sub">How would you like to add it?</p>
      </header>

      <div className="add-food-body">
        <ul className="option-list">
          {OPTIONS.map((option) => {
            const disabled = option.needsNetwork && !online
            return (
              <li key={option.to}>
                <button
                  type="button"
                  className="option-card"
                  onClick={() => navigate(option.to)}
                  disabled={disabled}
                >
                  <span className="option-emoji" role="presentation">
                    {option.emoji}
                  </span>
                  <span className="option-main">
                    <span className="option-title">{option.title}</span>
                    <span className="option-body">{option.body}</span>
                  </span>
                  <span className="option-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {anyDisabled && (
          <p className="capture-offline-note">
            Scan and Voice need a connection. You can still add items by typing.
          </p>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
