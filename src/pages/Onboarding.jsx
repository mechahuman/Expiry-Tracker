import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import './Onboarding.css'

const SLIDES = [
  {
    emoji: '🧊',
    title: 'Know what’s in your kitchen',
    body: 'Keep every packaged item in one place, with its expiry date front and centre.',
  },
  {
    emoji: '🎙️',
    title: 'Add items in seconds',
    body: 'Type it, say it out loud, or point your camera at the pack — whatever’s fastest.',
  },
  {
    emoji: '🔔',
    title: 'Never waste food again',
    body: 'Get a nudge before something expires, and earn badges for using things in time.',
  },
]

export default function Onboarding() {
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding)
  const navigate = useNavigate()

  const finish = () => {
    completeOnboarding()
    navigate('/login', { replace: true })
  }

  return (
    <div className="onboarding">
      {/* Plain CSS scroll-snap carousel -- no library needed. */}
      <div className="slides">
        {SLIDES.map((slide) => (
          <section className="slide" key={slide.title}>
            <span className="slide-emoji" role="presentation">
              {slide.emoji}
            </span>
            <h1>{slide.title}</h1>
            <p>{slide.body}</p>
          </section>
        ))}
      </div>

      <div className="onboarding-actions">
        <p className="swipe-hint">Swipe to see more</p>
        <button type="button" className="btn-primary" onClick={finish}>
          Get started
        </button>
      </div>
    </div>
  )
}
