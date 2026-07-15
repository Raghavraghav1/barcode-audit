import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      },
      manifest: {
        name: 'Barcode Audit App — Offline Warehouse Auditor Kit',
        short_name: 'BarcodeAudit',
        description: 'Sleek, offline-first barcode audit tool for warehouse inventory auditing. Powered by IndexedDB and SheetJS.',
        theme_color: '#f59e0b',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        orientation: 'any',
        icons: [
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})

