import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new deploy waits for the user to tap "Reload" (PwaUpdatePrompt) rather than reloading
      // the page under them mid-recording.
      registerType: 'prompt',
      manifest: {
        id: '/',
        name: '1:1 care records',
        short_name: '1:1 Care',
        description: 'Plan, record and report 1-to-1 support hours.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Links into the app (e.g. a check-in screen's QR, `/?checkin=…`) open in the installed
        // app where the platform allows it (Android/desktop Chrome), reusing an open window.
        // iOS never routes links to a home-screen app — the in-app "Scan QR code" covers that.
        handle_links: 'preferred',
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        theme_color: '#173327',
        background_color: '#eff3ee',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Precache the app shell only. API responses (care records, photos, reports) are never
        // cached by the service worker: they're personal data and must always be live.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              // The stylesheet <link> has no crossorigin attribute, so its response is opaque.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Forward API calls to the backend during development, avoiding CORS. The path is
      // passed through unchanged: the server mounts the API under `/api`, matching prod.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
