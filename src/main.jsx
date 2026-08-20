import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { configError } from './lib/supabaseClient.js'

const root = createRoot(document.getElementById('root'))

// A misconfigured deployment can't do anything useful, so say so plainly
// instead of mounting an app whose every request would fail.
if (configError) {
  root.render(
    <div className="fatal-error">
      <h1>App isn’t configured</h1>
      <p>{configError}</p>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
