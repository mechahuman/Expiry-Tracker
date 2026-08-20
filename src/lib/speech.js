/**
 * Thin wrapper over the Web Speech API.
 *
 * vosk-browser (the roadmap's offline fallback) is deliberately not wired up
 * yet: its model is a ~50MB download, and among current browsers only Firefox
 * lacks SpeechRecognition -- Chrome (desktop and Android) and Safari both
 * support it, which covers this PWA's install targets. Unsupported browsers
 * get told to use manual entry instead. If vosk is added later, it slots in
 * behind this same interface without the UI changing.
 */

export function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export const isSpeechSupported = () => Boolean(getRecognitionCtor())

/** Human-readable text for the SpeechRecognition error codes worth explaining. */
export function describeSpeechError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow it in your browser settings and try again.'
    case 'no-speech':
      return "Didn't catch anything. Try again and speak clearly."
    case 'audio-capture':
      return 'No microphone found on this device.'
    case 'network':
      // Chrome's implementation does recognition server-side, so this is a
      // real failure mode rather than a theoretical one.
      return 'Speech recognition needs a network connection.'
    case 'aborted':
      return ''
    default:
      return 'Something went wrong with speech recognition. Try again.'
  }
}

/**
 * Starts listening. Returns a stop() handle.
 *
 * @param {object} handlers
 * @param {(text: string) => void} handlers.onInterim  live partial transcript
 * @param {(text: string) => void} handlers.onFinal    settled transcript, once
 * @param {(message: string) => void} handlers.onError
 * @param {() => void} handlers.onEnd
 */
export function startListening({ onInterim, onFinal, onError, onEnd }) {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    onError?.('Voice input is not supported in this browser.')
    return () => {}
  }

  const recognition = new Ctor()
  // en-IN gives noticeably better results than en-US on Indian product names.
  recognition.lang = 'en-IN'
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let finalText = ''

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (result.isFinal) finalText += result[0].transcript
      else interim += result[0].transcript
    }
    if (interim) onInterim?.(interim)
    if (finalText) onInterim?.(finalText)
  }

  recognition.onerror = (event) => {
    const message = describeSpeechError(event.error)
    if (message) onError?.(message)
  }

  recognition.onend = () => {
    // Fires on both a normal stop and an error, so the final transcript is
    // only handed over if something was actually heard.
    if (finalText.trim()) onFinal?.(finalText.trim())
    onEnd?.()
  }

  try {
    recognition.start()
  } catch {
    onError?.('Could not start listening. Try again.')
  }

  return () => {
    try {
      recognition.stop()
    } catch {
      /* already stopped */
    }
  }
}
