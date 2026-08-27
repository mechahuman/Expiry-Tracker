import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import './Onboarding.css'

const SLIDES = [
  {
    emoji: '🧊',
    title: 'See It All',
    body: 'Track everything in your fridge, pantry, and freezer at a single glance. No more forgotten ingredients.',
  },
  {
    emoji: '🔔',
    title: 'Eat It First',
    body: 'Smart alerts gently remind you what needs to be eaten first before it expires. Save money and eat fresh.',
  },
  {
    emoji: '🌱',
    title: 'Waste Less',
    body: 'Reduce your household food waste and track your daily positive impact on our beautiful planet.',
  },
]

export default function Onboarding() {
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding)
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const finish = () => {
    completeOnboarding()
    navigate('/login', { replace: true })
  }

  const slide = SLIDES[step]
  const isLast = step === SLIDES.length - 1

  return (
    <div className="onboarding">
      <header className="onboarding-top">
        <span className="onboarding-brand">ClearEat</span>
        {/* Skip disappears on the last slide, where its only remaining
            behaviour would duplicate the primary button beneath it. */}
        {!isLast && (
          <button type="button" className="btn-text" onClick={finish}>
            Skip
          </button>
        )}
      </header>

      <section className="slide">
        <span className="slide-emoji" role="presentation">
          {slide.emoji}
        </span>
        <h1>{slide.title}</h1>
        <p>{slide.body}</p>
      </section>

      <div className="onboarding-actions">
        <div className="dots" role="presentation">
          {SLIDES.map((s, i) => (
            <span key={s.title} className={`dot ${i === step ? 'active' : ''}`} />
          ))}
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
        >
          {isLast ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  )
}
