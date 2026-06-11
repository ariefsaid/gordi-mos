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
      VITE_SUPABASE_URL: 'http://127.0.0.1:44321',
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/auth/**',
        'src/lib/db/**',
        'src/lib/supabase.ts',
        'src/lib/week.ts',
        'src/lib/dueStatus.ts',
        'src/lib/raciMember.ts',
        'src/pages/LoginPage.tsx',
        'src/pages/RecoveryPage.tsx',
        'src/pages/MyWeek.tsx',
        'src/pages/TasksPage.tsx',
        'src/pages/TaskNewPlaceholder.tsx',
        'src/pages/UpdatesPage.tsx',
        'src/pages/OpsPage.tsx',
        'src/pages/NotFoundPage.tsx',
        'src/shell/**',
      ],
      exclude: ['**/*.test.{ts,tsx}', 'src/lib/database.types.ts', 'src/vite-env.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
