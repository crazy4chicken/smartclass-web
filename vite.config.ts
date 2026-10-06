import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const iamOrigin = process.env.IAM_ORIGIN || 'http://127.0.0.1:8080'
const dispatchOrigin = process.env.DISPATCH_ORIGIN || 'http://127.0.0.1:8081'
const fileOrigin = process.env.FILE_ORIGIN || 'http://127.0.0.1:8095'

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
      // smartclass-dispatchub keeps its own paths (`/api/v1/...`, `/healthz`).
      '/dispatch-api': {
        target: dispatchOrigin,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dispatch-api/, ''),
      },
      // nsc-filehouse keeps its own paths (`/api/v1/...`, `/presign/...`, `/healthz`).
      '/file-api': {
        target: fileOrigin,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/file-api/, ''),
      },
    },
  },
})
