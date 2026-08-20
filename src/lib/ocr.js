/**
 * Tesseract.js wrapper.
 *
 * Loaded via dynamic import() so the OCR stack stays out of the app-shell
 * bundle, and excluded from the Workbox precache in vite.config.js so the
 * service worker doesn't quietly download it at install time either.
 * Tesseract additionally fetches its worker, WASM core and ~10MB English
 * language data from a CDN on first use -- which keeps our deploy small, at
 * the cost of needing a network connection the first time someone scans.
 */

// Below this, the read is treated as unreliable and the user gets an explicit
// warning to check the date rather than a silently-wrong pre-filled field.
// The roadmap's OCR.space fallback (deferred to phase 2) would hook in here.
export const CONFIDENCE_THRESHOLD = 60

let tesseractPromise
function loadTesseract() {
  if (!tesseractPromise) tesseractPromise = import('tesseract.js')
  return tesseractPromise
}

/**
 * @param {HTMLCanvasElement} canvas preprocessed image
 * @param {(progress: {status: string, progress: number}) => void} [onProgress]
 * @returns {Promise<{text: string, confidence: number, lowConfidence: boolean}>}
 */
export async function recognizeText(canvas, onProgress) {
  const Tesseract = await loadTesseract()

  const { data } = await Tesseract.recognize(canvas, 'eng', {
    logger: (message) => {
      if (message.status && typeof message.progress === 'number') onProgress?.(message)
    },
  })

  const confidence = typeof data.confidence === 'number' ? data.confidence : 0
  return {
    text: data.text ?? '',
    confidence,
    lowConfidence: confidence < CONFIDENCE_THRESHOLD,
  }
}
