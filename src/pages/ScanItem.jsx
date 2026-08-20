import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { preprocessForOcr } from '../lib/imagePreprocess'
import { disposeOcr, recognizeText } from '../lib/ocr'
import { parseOcrText } from '../lib/ocrParser'
import './ScanItem.css'

// The guide frame, as a fraction of the video frame. Only this region is sent
// to OCR -- cropping away the rest of the pack is the single biggest accuracy
// win, since it removes the marketing copy and nutrition tables that otherwise
// compete with the date for Tesseract's attention.
const GUIDE = { widthRatio: 0.86, heightRatio: 0.3 }

const supportsCamera = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

export default function ScanItem() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [status, setStatus] = useState('starting') // starting | ready | working | error
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!supportsCamera()) {
      setError('Camera access isn’t available in this browser.')
      setStatus('error')
      return undefined
    }

    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        // Unmounted while the permission prompt was open -- release it rather
        // than leaving the camera light on.
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings and try again.'
            : err?.name === 'NotFoundError'
              ? 'No camera found on this device.'
              : 'Could not start the camera. Try again.',
        )
        setStatus('error')
      })

    return () => {
      cancelled = true
      stopCamera()
      // Free the OCR worker (and its loaded language data) on the way out --
      // it's only worth holding while the scanner is actually open.
      disposeOcr()
    }
  }, [stopCamera])

  const capture = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    setStatus('working')
    setProgress('Reading the label…')

    try {
      const width = video.videoWidth * GUIDE.widthRatio
      const height = video.videoHeight * GUIDE.heightRatio
      const crop = {
        x: (video.videoWidth - width) / 2,
        y: (video.videoHeight - height) / 2,
        width,
        height,
      }

      const canvas = preprocessForOcr(video, crop)
      const { text, confidence, lowConfidence } = await recognizeText(canvas, (message) => {
        if (message.status === 'recognizing text') {
          setProgress(`Reading the label… ${Math.round(message.progress * 100)}%`)
        }
      })

      // Camera is no longer needed once the frame is captured.
      stopCamera()

      const parsed = parseOcrText(text)
      navigate('/verify', {
        state: {
          parsed: { name: '', quantity: null, unit: null, expiry_date: parsed.expiry_date },
          detected: parsed.detected,
          transcript: parsed.expiry_date
            ? `Read from the pack (${Math.round(confidence)}% confident)`
            : '',
          inputMethod: 'ocr',
          warning: !parsed.expiry_date
            ? 'Couldn’t find a date on the pack — enter it below, or rescan with the date inside the frame.'
            : lowConfidence
              ? 'The print was hard to read, so double-check the date before saving.'
              : '',
        },
      })
    } catch {
      setError('Couldn’t read the image. Try again with more light or a steadier shot.')
      setStatus('ready')
    }
  }

  return (
    <div className="scan">
      <header className="scan-header">
        <button type="button" className="btn-text" onClick={() => navigate('/home')}>
          Cancel
        </button>
        <h2>Scan the pack</h2>
        <span className="header-spacer" aria-hidden="true" />
      </header>

      {status === 'error' ? (
        <div className="scan-body">
          <p className="form-banner error">{error}</p>
          <button type="button" className="btn-primary" onClick={() => navigate('/add')}>
            Type it instead
          </button>
        </div>
      ) : (
        <>
          <div className="scan-viewport">
            <video ref={videoRef} autoPlay playsInline muted className="scan-video" />
            <div
              className="scan-guide"
              style={{
                width: `${GUIDE.widthRatio * 100}%`,
                height: `${GUIDE.heightRatio * 100}%`,
              }}
            />
            {status === 'working' && <div className="scan-overlay">{progress}</div>}
          </div>

          <div className="scan-controls">
            <p className="scan-hint">
              Line up the <strong>expiry or best-before date</strong> inside the frame. Only what’s
              inside gets read.
            </p>
            {error && <p className="form-banner error">{error}</p>}
            <button
              type="button"
              className="btn-primary"
              onClick={capture}
              disabled={status !== 'ready'}
            >
              {status === 'working' ? 'Reading…' : 'Capture'}
            </button>
            <button type="button" className="btn-text" onClick={() => navigate('/add')}>
              Type it instead
            </button>
          </div>
        </>
      )}
    </div>
  )
}
