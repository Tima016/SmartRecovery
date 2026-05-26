import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000, // suppress chunk size warning in Docker builds
  },
  server: {
    port: 5173,
    proxy: {
      // Dev only: forward /api calls to the Express backend
      // In production, nginx handles this via proxy_pass
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
