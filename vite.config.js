import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest rather than the default generateSW: push notifications
      // need `push` and `notificationclick` listeners in the service worker,
      // and a generated one can't carry custom code. src/sw.js does the
      // precaching Workbox would have done, plus those handlers.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
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
          // Android crops adaptive icons to a device-chosen shape. Without a
          // maskable entry it pillarboxes the normal icon inside a white
          // circle; with one, the artwork fills the shape properly.
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // Worth knowing: this glob precaches *every* emitted JS chunk,
        // including lazily imported ones -- so dynamic import() keeps a
        // library out of the app-shell bundle, but Workbox still downloads it
        // at service-worker install. That's fine for what's currently here:
        // chrono-node is ~43kB and buys offline voice parsing, and only a
        // ~17kB wrapper of tesseract.js reaches dist at all. Tesseract fetches
        // its worker, ~4MB WASM core and language data straight from jsdelivr
        // at runtime, so none of that bulk is ours to cache -- at the cost of
        // needing a network connection the first time someone scans.
        // If a genuinely heavy library is ever bundled locally, exclude its
        // chunk here; note that Rollup may name it after the package's
        // internal path (tesseract.js emits as `src-*.js`), so match on the
        // real emitted filename rather than the package name.
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
