import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Poppins is self-hosted rather than pulled from Google Fonts: the woff2 files
// end up in the build, so Workbox precaches them (see the woff2 entry in
// vite.config.js globPatterns) and the app keeps its typeface offline. A CDN
// link would silently fall back to system-ui exactly when the offline shell
// built in Module 10 is doing its job.
//
// Latin subset only. The bare '400.css' entrypoints pull in Devanagari and
// latin-ext too -- 12 font files instead of 4, all of them precached upfront,
// for glyphs this app's UI copy never uses.
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'

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
