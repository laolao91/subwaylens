import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Replace @protobufjs/inquire with a no-op stub. The real module uses
      // eval() to dynamically require() optional Node.js modules — that path
      // is never reached in a bundled browser build, but the EvenHub static
      // scanner flags any eval() in the bundle regardless.
      '@protobufjs/inquire': path.resolve(__dirname, 'src/lib/inquire-stub.cjs'),
    },
  },
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