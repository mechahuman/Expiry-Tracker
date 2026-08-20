import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Expiry Tracker',
        short_name: 'Expiry Tracker',
        description: 'Track packaged food inventory and expiry dates',
        theme_color: '#0f9d8a',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // NOTE for Module 6: this glob precaches *every* emitted JS chunk,
        // including the lazily-imported ones -- so a dynamic import() keeps a
        // library out of the app-shell bundle but Workbox still downloads it
        // during service-worker install. That's a fair trade for chrono-node
        // (~43kB gzipped, and it buys offline voice parsing), but it would
        // undo the whole point for Tesseract.js/OpenCV.js. When those land,
        // exclude their chunks here and let them fetch on demand instead.
      },
    }),
  ],
  // Voice (Module 5) and OCR (Module 6) must dynamic-import() their heavy
  // WASM libs (vosk-browser, Tesseract.js, OpenCV.js) — e.g.
  // `const Tesseract = await import('tesseract.js')` inside the component
  // that needs them, not a static top-level import. Vite/Rolldown code-splits
  // dynamic imports into their own chunk automatically, so this keeps them
  // out of the app-shell bundle without any extra bundler config.
})
