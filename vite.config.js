// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // 이 부분을 추가하거나 확인하세요
  build: {
    outDir: 'dist',
  }
})
