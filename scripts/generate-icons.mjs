/**
 * Regenerates every PNG app icon from src/assets/logo-mark.svg.
 *
 * Committed rather than run ad hoc so the icons can be rebuilt when the mark
 * changes, without anyone having to remember the sizes, the colour
 * substitution, or the maskable safe zone.
 *
 *   node scripts/generate-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const BRAND = '#1e5e3c'
const CREAM = '#fff7ec'

// currentColor has no meaning outside a document, so bake the brand green in.
const markSvg = readFileSync('src/assets/logo-mark.svg', 'utf8').replaceAll('currentColor', BRAND)

/** The mark, centred on a full-bleed cream square at `scale` of the canvas. */
async function render(size, scale, out) {
  const inner = Math.round(size * scale)
  const art = await sharp(Buffer.from(markSvg), { density: 900 })
    .resize(inner, inner)
    .png()
    .toBuffer()

  const pad = Math.round((size - inner) / 2)
  await sharp({
    create: { width: size, height: size, channels: 4, background: CREAM },
  })
    .composite([{ input: art, top: pad, left: pad }])
    .png()
    .toFile(out)

  console.log(`  ${out.padEnd(34)} ${size}px, art at ${Math.round(scale * 100)}%`)
}

// Full-bleed squares, no pre-rounded corners: iOS and Android both apply their
// own mask, and baking a radius in leaves dark wedges outside theirs.
await render(192, 0.92, 'public/icon-192.png')
await render(512, 0.92, 'public/icon-512.png')
await render(180, 0.92, 'public/apple-touch-icon.png')

// Android crops adaptive icons to a device-chosen shape, and anything within
// roughly 10% of the edge can be cut. 80% keeps the whole mark inside the safe
// zone whatever shape the launcher picks. This is the one output that is not
// simply a resize of the others.
await render(512, 0.8, 'public/icon-maskable-512.png')
