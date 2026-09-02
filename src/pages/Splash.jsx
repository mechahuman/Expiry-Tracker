import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import Logo from '../components/Logo'
import './Splash.css'

/**
 * The welcome screen, from design/figma/splash.html.
 *
 * Named "splash" after the Figma frame, though it is really a welcome screen:
 * it waits for a tap rather than dismissing itself. It shows once, before
 * onboarding, and is skipped for good afterwards.
 *
 * The frame uses a raster lockup with a white box baked into it, which shows
 * as a pale rectangle against the cream. The Logo component draws the same
 * lockup as vector, so it sits on the background cleanly and stays sharp on
 * any display. `detail` is safe here: the mark renders near 70px, well above
 * the size where the full artwork stops being legible.
 */
export default function Splash() {
  const navigate = useNavigate()
  const hasOnboarded = useAuthStore((s) => s.hasOnboarded)

  // Someone who has already been through this should never see it again, even
  // by typing the URL. Redirecting during render avoids a flash of the splash.
  if (hasOnboarded) return <Navigate to="/" replace />

  return (
    <div className="splash">
      <div className="splash-mark">
        <Logo tone="dark" detail className="splash-logo" />
        <p className="splash-tagline">
          See it all. <span className="splash-tagline-em">Eat it first.</span> Waste less.
        </p>
      </div>

      {/* Does NOT call completeOnboarding: that belongs to Onboarding's own
          finish, or skipping here would skip the slides for good. */}
      <button type="button" className="btn-primary" onClick={() => navigate('/onboarding')}>
        Get Started
      </button>
    </div>
  )
}
