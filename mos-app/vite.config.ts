/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/mos/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    // Inject stub env vars so supabase.ts doesn't throw during unit tests (real client is mocked).
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:55321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    // Set jsdom's base URL to /mos/ so createBrowserRouter (basename="/mos") resolves routes.
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/mos/',
      },
    },
    // Keep Playwright's e2e specs out of the Vitest run.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
