import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@multiversx/sdk-dapp-ui'],
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy Socket.io and API requests to backend server
      '/socket.io': {
        target: 'http://localhost:5001',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
