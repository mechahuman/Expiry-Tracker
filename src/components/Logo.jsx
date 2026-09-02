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
 * The compact mark, mirroring src/assets/logo-mark-compact.svg.
 *
 * NOT the detailed src/assets/logo-mark.svg, which is what
 * scripts/generate-icons.mjs rasterises for the app icons. That one carries
 * shelf contents and clock hands which are legible at 180px and up but turn to
 * mush below about 48px -- and the logo renders at 26-40px at every call site
 * here. Rendering both at true size and comparing is what settled it.
 *
 * aria-hidden because the wordmark beside it already spells the name; exposing
 * both would make a screen reader announce "ClearEat" twice.
 */
function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {/* Heavier stroke than the detailed mark, so the ring holds at 26px. */}
      <path
        d="M46.6 12.6a25 25 0 1 1-11-5.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />

      <path
        d="M41.6 10.2c2.6-5 8.2-7.6 14.4-6.8.8 6.2-2 11.6-7.2 13.6-4.8 1.8-9.4-1.6-7.2-6.8Z"
        fill="var(--logo-leaf)"
      />

      {/* Fridge silhouette: divider and handle only. Centred, since there are
          no clock hands needing the right-hand channel. */}
      <rect
        x="22"
        y="18"
        width="20"
        height="28"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path d="M22.5 28.5h19" stroke="currentColor" strokeWidth="3.2" />
      <path
        d="M37.4 22.8v3.2M37.4 31.4v3.2"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
