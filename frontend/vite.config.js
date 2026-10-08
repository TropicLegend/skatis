import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Nichts wird als `data:`-Adresse ins CSS oder JS eingebettet: Die
  // Content-Security-Policy der ausgelieferten Seite erlaubt Schriften nur von
  // der eigenen Adresse (`font-src 'self'`), und kleine Schrift-Teilmengen
  // würden sonst eingebettet – und blockiert.
  build: { assetsInlineLimit: 0 },
})
