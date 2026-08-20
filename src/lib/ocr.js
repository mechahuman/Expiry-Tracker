/**
 * Tesseract.js wrapper.
 *
 * Loaded via dynamic import() so the OCR stack stays out of the app-shell
 * bundle. Tesseract additionally fetches its worker, WASM core and ~10MB
 * English language data from a CDN on first use -- which keeps our deploy
 * small, at the cost of needing a network connection the first time someone
 * scans.
 */

// Below this, the read is treated as unreliable and the user gets an explicit
// warning to check the date rather than a silently-wrong pre-filled field.
// The roadmap's OCR.space fallback (deferred to phase 2) would hook in here.
export const CONFIDENCE_THRESHOLD = 60

// One worker, reused across scans.
//
// The obvious call is Tesseract.recognize(), but it creates a worker and
// terminates it in a `finally` on every single call -- so each scan re-spins
// the worker and reloads the language data, adding seconds of latency to every
// capture after the first. Holding the worker means only the first scan of a
// session pays that cost. disposeOcr() releases it when the scanner closes.
let workerPromise = null

// Note: the logger binds at worker creation, so only the first caller's
// onProgress is used for the worker's lifetime. Fine as used -- ScanItem's
// callback just forwards to a stable setState, and disposeOcr() on unmount
// means a remounted scanner builds a fresh worker with its own logger.
async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await import('tesseract.js')
      return Tesseract.createWorker('eng', 1, {
        logger: (message) => {
          if (message.status && typeof message.progress === 'number') onProgress?.(message)
        },
      })
    })().catch((error) => {
      // Don't cache a failed init, or every later attempt returns the same
      // rejection and the scanner can never recover without a page reload.
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

/**
 * @param {HTMLCanvasElement} canvas preprocessed image
 * @param {(progress: {status: string, progress: number}) => void} [onProgress]
 * @returns {Promise<{text: string, confidence: number, lowConfidence: boolean}>}
 */
export async function recognizeText(canvas, onProgress) {
  const worker = await getWorker(onProgress)
  const { data } = await worker.recognize(canvas)

  const confidence = typeof data.confidence === 'number' ? data.confidence : 0
  return {
    text: data.text ?? '',
    confidence,
    lowConfidence: confidence < CONFIDENCE_THRESHOLD,
  }
}

/** Releases the worker. Call when leaving the scanner. */
export async function disposeOcr() {
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = null
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    /* Init failed or it's already gone -- nothing to release. */
  }
}
