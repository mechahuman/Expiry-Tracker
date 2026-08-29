import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import fridgeArt from '../assets/onboarding-fridge.webp'
import expiryArt from '../assets/onboarding-expiry.webp'
import wasteArt from '../assets/onboarding-waste.webp'
import './Onboarding.css'

// Artwork from the ClearEat Figma, archived in design/figma/images/. Imported
// rather than referenced from public/ so Vite fingerprints them -- these are
// content, not fixed-URL assets like the favicon.
//
// The images carry no information the copy doesn't, so alt="" marks them
// decorative and keeps a screen reader from announcing a description that
// merely repeats the heading below it.
const SLIDES = [
  {
    art: fridgeArt,
    title: 'See It All',
    body: 'Track everything in your fridge, pantry, and freezer at a single glance. No more forgotten ingredients.',
  },
  {
    art: expiryArt,
    title: 'Eat It First',
    body: 'Smart alerts gently remind you what needs to be eaten first before it expires. Save money and eat fresh.',
  },
  {
    art: wasteArt,
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
        <img className="slide-art" src={slide.art} alt="" />
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
