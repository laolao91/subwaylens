import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy protobuf/GTFS vendor code from app code.
        // Cuts the main chunk from ~629 KB to ~200 KB gzip, improving
        // TTI on the Android phone settings page.
        manualChunks: {
          'vendor-gtfs': ['gtfs-realtime-bindings', 'protobufjs'],
          'vendor-react': ['react', 'react-dom', 'react-is', 'react-router'],
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
})