import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const iamOrigin = process.env.IAM_ORIGIN || 'http://127.0.0.1:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/iam-api': {
        target: iamOrigin,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/iam-api/, ''),
      },
    },
  },
})
