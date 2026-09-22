import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import './Disclaimer.css'

export default function Disclaimer() {
  const navigate = useNavigate()
  const acceptDisclaimer = useAuthStore((s) => s.acceptDisclaimer)

  const handleClose = () => {
    acceptDisclaimer()
    navigate('/home', { replace: true })
  }

  return (
    <div className="disclaimer-page">
      <header className="disclaimer-header">
        <button type="button" className="btn-text close-btn" onClick={handleClose}>
          ✕
        </button>
      </header>

      <div className="disclaimer-body">
        <h1>Legal Disclaimer</h1>
        
        <div className="disclaimer-text">
          <p>
            Welcome to ClearEat. Before you begin tracking your inventory, please read this important notice regarding the use of our application.
          </p>
          <p>
            ClearEat is provided strictly as an organizational tool designed to help you manage your kitchen inventory and minimize food waste. While we strive to provide accurate expiry date scanning and reminders, this application does not evaluate or guarantee food safety, quality, or fitness for consumption.
          </p>
          <p>
            Expiry dates read by our OCR scanner, voice input, or inputted manually are for reference purposes only and may not reflect the actual physical condition of the item. It is your sole responsibility to inspect all food and beverage items—visually and by smell—before consuming them.
          </p>
          <p>
            By closing this screen and continuing to use ClearEat, you acknowledge and agree that ClearEat and its developers are not liable for any illness, injury, or damages arising from the consumption of spoiled, expired, or unsafe items. Always use your best judgment—when in doubt, throw it out.
          </p>
        </div>
      </div>
    </div>
  )
}
