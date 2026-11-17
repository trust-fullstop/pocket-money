import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE lets the same build run under a sub-path (e.g. GitHub Pages: VITE_BASE=/pocket-money/).
const base = process.env.VITE_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Sow & Grow',
        short_name: 'Sow & Grow',
        description: 'Do your part, see it grow: family life, responsibility, saving and faith.',
        theme_color: '#0f766e',
        background_color: '#f4f5f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // The in-browser demo database (PGlite: ~15 MB of wasm/data) is never precached:
        // cloud users don't need it. It is cached on first use instead (runtimeCaching below).
        globIgnores: ['**/pglite*', '**/*.wasm', '**/*.data', '**/*.tar.gz'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/[^?]*(pglite|initdb|pgcrypto|\.wasm|\.data|\.tar\.gz)[^/]*$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pglite',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    rolldownOptions: {
      output: {
        // Keep PGlite in its own, predictably named chunk so the service worker can skip it.
        codeSplitting: { groups: [{ name: 'pglite', test: /node_modules[\\/]@electric-sql[\\/]pglite/ }] },
      },
    },
  },
})
