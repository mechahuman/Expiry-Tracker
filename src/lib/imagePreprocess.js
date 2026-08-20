/**
 * Canvas-based image cleanup before OCR. Deliberately not OpenCV.js: greyscale,
 * upscaling and a contrast stretch are what actually move the needle on faint
 * or low-contrast date printing, and they're a few lines of Canvas 2D rather
 * than an ~8MB WASM dependency. OpenCV earns its size for deskewing and
 * perspective correction -- worth adding if real photos prove it's needed.
 */

// Tesseract does noticeably better on larger text; capture is usually well
// under this, so the crop gets upscaled rather than downscaled.
const TARGET_WIDTH = 1600

/** Rec. 709 luma -- matches how brightness is actually perceived. */
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/**
 * Intensity range covering the middle `1 - 2*cut` of pixels. Using percentiles
 * rather than absolute min/max means a few blown-out highlights or dust specks
 * can't flatten the stretch for the whole image.
 */
export function contrastBounds(values, cut = 0.02) {
  const histogram = new Array(256).fill(0)
  for (const v of values) histogram[v] += 1

  const total = values.length
  const lowTarget = total * cut
  const highTarget = total * (1 - cut)

  let low = 0
  let high = 255
  let seen = 0
  for (let i = 0; i < 256; i += 1) {
    seen += histogram[i]
    if (seen >= lowTarget) {
      low = i
      break
    }
  }
  seen = 0
  for (let i = 0; i < 256; i += 1) {
    seen += histogram[i]
    if (seen >= highTarget) {
      high = i
      break
    }
  }
  // Degenerate (near-flat) images stretch to nothing; leave them alone.
  return high - low < 8 ? { low: 0, high: 255 } : { low, high }
}

/**
 * Crops a region out of a video frame or image, upscales it, and returns a
 * greyscale contrast-stretched canvas ready for Tesseract.
 *
 * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source
 * @param {{x: number, y: number, width: number, height: number}} [crop]
 *        region in source pixels; defaults to the whole frame
 * @returns {HTMLCanvasElement}
 */
export function preprocessForOcr(source, crop) {
  const sourceWidth = source.videoWidth ?? source.naturalWidth ?? source.width
  const sourceHeight = source.videoHeight ?? source.naturalHeight ?? source.height

  const region = crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight }
  const scale = TARGET_WIDTH / region.width

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(region.width * scale)
  canvas.height = Math.round(region.height * scale)

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    source,
    region.x, region.y, region.width, region.height,
    0, 0, canvas.width, canvas.height,
  )

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data

  // Greyscale in place, keeping the luma values for the histogram.
  const greys = new Uint8Array(pixels.length / 4)
  for (let i = 0, g = 0; i < pixels.length; i += 4, g += 1) {
    greys[g] = luma(pixels[i], pixels[i + 1], pixels[i + 2]) | 0
  }

  const { low, high } = contrastBounds(greys)
  const range = high - low

  for (let i = 0, g = 0; i < pixels.length; i += 4, g += 1) {
    const stretched = Math.max(0, Math.min(255, ((greys[g] - low) * 255) / range))
    pixels[i] = stretched
    pixels[i + 1] = stretched
    pixels[i + 2] = stretched
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}
