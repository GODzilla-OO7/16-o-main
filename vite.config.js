import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Player data and libraries change rarely, so returning players keep them cached
        // when only the game code is updated.
        manualChunks(id) {
          if (id.includes('/src/data/players.js')) return 'players'
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
})
