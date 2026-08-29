import './Logo.css'

/**
 * The ClearEat lockup: pictorial mark plus wordmark.
 *
 * The wordmark is live text, not artwork. Poppins is already self-hosted and
 * precached, so text stays perfectly crisp at any size, is selectable and
 * translatable, and needs no font embedded in an SVG. Only the mark genuinely
 * has to be drawn.
 *
 * The mark is inlined rather than loaded through <img> because an <img> cannot
 * inherit `currentColor` or read CSS custom properties -- and colour is exactly
 * what has to change between the two tones.
 *
 * @param {'dark'|'light'} tone  'dark' on cream, 'light' on the brand-green bar
 * @param {boolean} showTagline  renders the strapline beneath the wordmark
 */
export default function Logo({ tone = 'dark', showTagline = false, className = '' }) {
  return (
    <span className={`logo logo-${tone} ${className}`.trim()}>
      <LogoMark />
      <span className="logo-text">
        <span className="logo-word">
          <span className="logo-word-a">Clear</span>
          <span className="logo-word-b">Eat</span>
        </span>
        {showTagline && (
          <span className="logo-tagline">
            See it all. <span className="logo-tagline-em">Eat it first.</span> Waste less.
          </span>
        )}
      </span>
    </span>
  )
}

/**
 * Kept in sync with src/assets/logo-mark.svg, which is the file
 * scripts/generate-icons.mjs reads to build the PNG app icons. Edit both, or
 * the icons and the in-app logo drift apart.
 *
 * aria-hidden because the wordmark beside it already spells the name; exposing
 * both would make a screen reader announce "ClearEat" twice.
 */
function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M46.6 12.6a25 25 0 1 1-11-5.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M41.6 10.2c2.6-5 8.2-7.6 14.4-6.8.8 6.2-2 11.6-7.2 13.6-4.8 1.8-9.4-1.6-7.2-6.8Z"
        fill="var(--logo-leaf)"
      />
      <path
        d="M44.2 15.4c2.6-4.4 6.4-8 11-10.4"
        fill="none"
        stroke="var(--logo-leaf-rib)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      <rect
        x="19"
        y="18"
        width="19"
        height="28.5"
        rx="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M19 28h19" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M34.6 22.6v3M34.6 30.8v3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />

      <rect x="22.2" y="21.2" width="3" height="5" rx="1.5" fill="var(--logo-leaf)" />
      <path d="M27.4 26.2a2.8 2.8 0 0 1 5.6 0Z" fill="var(--logo-produce)" />

      <path d="M22.2 43.4a3.6 3.6 0 0 1 6.6 0Z" fill="var(--logo-leaf)" />
      <circle cx="32.4" cy="41.4" r="2.2" fill="#e74c3c" />
      <path
        d="M23 36.4h5"
        stroke="var(--logo-produce)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      <circle cx="44" cy="32" r="1.7" fill="#ff9a3c" />
      <path d="M44 32v-7" stroke="#ff9a3c" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M44 32 50.4 38.4" stroke="#ff9a3c" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  )
}
