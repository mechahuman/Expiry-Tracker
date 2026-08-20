import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSpeechSupported, startListening } from '../lib/speech'
import { parseTranscript } from '../lib/voiceParser'
import './VoiceInput.css'

export default function VoiceInput() {
  const navigate = useNavigate()
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [parsing, setParsing] = useState(false)
  const stopRef = useRef(null)
  const supported = isSpeechSupported()

  // Make sure the mic is released if the user navigates away mid-listen.
  useEffect(() => () => stopRef.current?.(), [])

  const handleFinal = async (text) => {
    setParsing(true)
    const parsed = await parseTranscript(text)
    // Voice never saves directly -- everything goes through Verify first.
    navigate('/verify', {
      state: { parsed, detected: parsed.detected, transcript: text, inputMethod: 'voice' },
    })
  }

  const begin = () => {
    setError('')
    setTranscript('')
    setListening(true)
    stopRef.current = startListening({
      onInterim: setTranscript,
      onFinal: handleFinal,
      onError: (message) => {
        setError(message)
        setListening(false)
      },
      onEnd: () => setListening(false),
    })
  }

  const stop = () => stopRef.current?.()

  return (
    <div className="voice">
      <header className="voice-header">
        <button type="button" className="btn-text" onClick={() => navigate('/home')}>
          Cancel
        </button>
        <h2>Add by voice</h2>
        <span className="header-spacer" aria-hidden="true" />
      </header>

      {!supported ? (
        <div className="voice-body">
          <p className="form-banner error">
            Voice input isn’t supported in this browser. Chrome or Safari support it — or you can
            add the item by typing instead.
          </p>
          <button type="button" className="btn-primary" onClick={() => navigate('/add')}>
            Type it instead
          </button>
        </div>
      ) : (
        <div className="voice-body">
          <p className="voice-hint">
            Try: <em>“two packs of milk expiring 25th August”</em>
          </p>

          <button
            type="button"
            className={`mic-button ${listening ? 'listening' : ''}`}
            onClick={listening ? stop : begin}
            disabled={parsing}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
          >
            🎙️
          </button>

          <p className="voice-status">
            {parsing
              ? 'Working out what you said…'
              : listening
                ? 'Listening… tap to stop'
                : 'Tap the mic and say what you’re adding'}
          </p>

          {transcript && <p className="voice-transcript">{transcript}</p>}
          {error && <p className="form-banner error">{error}</p>}

          <button type="button" className="btn-text" onClick={() => navigate('/add')}>
            Type it instead
          </button>
        </div>
      )}
    </div>
  )
}
