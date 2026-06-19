/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev/preview ergonomics: visiting bare "/" or "/mos" (no trailing slash) otherwise
// shows Vite's "did you mean to visit /mos/ instead?" notice. Redirect those to the
// based path so the server lands straight on the app. Dev/preview only — production
// (ops.gordi.id/mos) is handled by the reverse proxy.
function redirectToBase(base = '/mos/'): Plugin {
  const bare = base.replace(/\/$/, '') // "/mos"
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? '').split('?')[0]
      if (path === '/' || path === bare) {
        res.writeHead(302, { Location: base })
        res.end()
        return
      }
      next()
    })
  }
  return {
    name: 'redirect-to-base',
    configureServer: install,
    configurePreviewServer: install,
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/mos/',
  plugins: [redirectToBase('/mos/'), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
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
        'src/pages/TasksLayout.tsx',
        'src/pages/TaskDetail.tsx',
        'src/pages/TaskCreate.tsx',
        'src/pages/TaskNewPlaceholder.tsx',
        'src/pages/UpdatesPage.tsx',
        'src/pages/OpsPage.tsx',
        'src/pages/OpsAddForm.tsx',
        'src/pages/NotFoundPage.tsx',
        'src/shell/**',
        // P2-2b: weekly update components
        'src/components/weekly/**',
        'src/components/tasks/**',
      ],
      exclude: ['**/*.test.{ts,tsx}', 'src/lib/database.types.ts', 'src/vite-env.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
