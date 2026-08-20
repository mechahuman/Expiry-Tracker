/**
 * Generates every app icon from one glyph definition.
 *
 *   node scripts/generate-icons.mjs
 *
 * Module 0 shipped solid-teal placeholders written by a hand-rolled PNG
 * encoder, because no image tooling was available at the time. This replaces
 * that: edit GLYPH below (or swap in real artwork) and re-run.
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const TEAL = '#0f9d8a'
const WHITE = '#ffffff'

// A carton with a clock: packaged food, and time running out. Designed on a
// 512 grid with heavy strokes so it survives being scaled down to a 16px
// browser tab.
const GLYPH = `
  <path d="M140 196h232v180a24 24 0 0 1-24 24H164a24 24 0 0 1-24-24V196Z"
        fill="none" stroke="${WHITE}" stroke-width="26" stroke-linejoin="round"/>
  <path d="M140 196l52-72h128l52 72"
        fill="none" stroke="${WHITE}" stroke-width="26"
        stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="352" cy="352" r="92" fill="${TEAL}"/>
  <circle cx="352" cy="352" r="72" fill="${WHITE}"/>
  <path d="M352 306v50l34 24"
        fill="none" stroke="${TEAL}" stroke-width="24"
        stroke-linecap="round" stroke-linejoin="round"/>
`

/** Rounded-square icon, as used for the favicon and the PWA manifest. */
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Expiry Tracker">
  <rect width="512" height="512" rx="112" fill="${TEAL}"/>
${GLYPH}</svg>
`

/**
 * Maskable variant: Android crops adaptive icons to a device-chosen shape
 * (circle, squircle, teardrop) and only the middle ~80% is guaranteed to
 * survive. So the background goes edge to edge with no rounding of its own,
 * and the glyph is inset to sit inside that safe zone.
 */
const SAFE_SCALE = 0.78
const inset = (512 * (1 - SAFE_SCALE)) / 2
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${TEAL}"/>
  <g transform="translate(${inset} ${inset}) scale(${SAFE_SCALE})">
${GLYPH}  </g>
</svg>
`

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()

const outputs = [
  ['favicon.svg', Buffer.from(standardSvg)],
  ['icon-192.png', await png(standardSvg, 192)],
  ['icon-512.png', await png(standardSvg, 512)],
  ['icon-maskable-512.png', await png(maskableSvg, 512)],
  // iOS ignores the manifest icons and looks for this one; it also composites
  // onto a white background, so a full-bleed square is what's wanted.
  ['apple-touch-icon.png', await png(standardSvg, 180)],
]

for (const [name, data] of outputs) {
  await writeFile(join(PUBLIC_DIR, name), data)
  console.log(`wrote public/${name}`)
}
