import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf('node_modules') === -1) {
            return undefined
          }

          if (id.indexOf('/react/') !== -1 || id.indexOf('/react-dom/') !== -1) {
            return 'react-vendor'
          }

          if (
            id.indexOf('/cytoscape/') !== -1
          ) {
            return 'cytoscape-vendor'
          }

          if (
            id.indexOf('/cytoscape-dagre/') !== -1 ||
            id.indexOf('/dagre/') !== -1 ||
            id.indexOf('/graphlib/') !== -1
          ) {
            return 'dagre-vendor'
          }

          return undefined
        },
      },
    },
  },
})
