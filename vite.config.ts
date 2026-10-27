import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'One Problem',
        short_name: 'One Problem',
        description: 'A quiet place to work through one math problem at a time.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8f6f0',
        theme_color: '#f8f6f0',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,ttf}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
