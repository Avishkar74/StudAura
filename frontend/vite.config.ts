/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // VITE_* values live in the repo-root .env, shared with the backend config.
  // In containers they arrive as real environment variables, which Vite also reads.
  envDir: '..',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: true,
    port: 5173,
    // File events do not cross Docker Desktop bind mounts on Windows/macOS; compose enables polling.
    watch: process.env.VITE_USE_POLLING ? { usePolling: true, interval: 300 } : undefined,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Generous limits: CI runners and cold starts are slower than a developer machine.
    testTimeout: 20_000,
  },
})
