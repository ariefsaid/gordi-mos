/// <reference types="vitest/config" />
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { MOS_DEV_IDENTITY_PATH, worktreeFingerprint } from './src/lib/dev-server'

const __dir = dirname(fileURLToPath(import.meta.url))

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

// #419 — dev-server worktree identity. The browser suite must never measure another
// worktree's app: playwright derives a per-worktree port, and e2e/global-setup.ts fetches
// this fingerprint before any test, refusing a server that is not provably this tree's.
// Dev-server-only (configureServer); builds and preview are unaffected.
function mosDevIdentity(): Plugin {
  const identity = worktreeFingerprint(__dir)
  return {
    name: 'mos-dev-identity',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] === MOS_DEV_IDENTITY_PATH) {
          res.setHeader('Cache-Control', 'no-store')
          res.end(identity)
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/mos/',
  plugins: [redirectToBase('/mos/'), mosDevIdentity(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // css:false — Vitest must NOT parse/inject the 51 imported stylesheets into every
    // jsdom environment. That CSS injection is pure overhead here: this suite asserts on
    // className strings (e.g. `.toolbar .chip`) and reads authored CSS rules straight off
    // the file via readFileSync (cssRuleBody) — NOTHING reads jsdom *computed* styles in the
    // hot path. The few getComputedStyle() usages (login-page, my-week, kitchen-log) all use
    // inline styles or negative assertions that hold on jsdom defaults, verified green with
    // css:false. Setting css:true made each per-file jsdom env re-parse 448K of CSS (~6s/env,
    // ~1400s cumulative across workers), saturating the event loop under the default fork
    // pool so RTL's 1000ms waitFor lapsed on the unluckiest test (tasks-workspace) — the
    // under-load flake. Dropping it removes the root overhead AND the contention.
    css: false,
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
    // Flake fix (2026-07-30). Two distinct defects, both from leaving testTimeout at its 5000ms
    // default while async budgets grew underneath it:
    //
    //  1. A per-test `waitFor(..., { timeout: 5000 })` (kitchen-plan-page.test.tsx:159) can NEVER
    //     spend its budget — the 5000ms test timeout fires first, so the test dies as a timeout
    //     rather than reporting the assertion. Not "slow under load": structurally unable to pass
    //     if the wait ever approaches its own limit. It flaked locally on exactly that path.
    //  2. The global asyncUtilTimeout of 3000 (src/test/setup.ts) left only 2000ms of slack before
    //     the test timeout. On a shared CI runner the `saved` confirmation assertion in the same
    //     file lapsed at 3078ms — right at that budget — turning CI red on a commit that changed
    //     no app code at all (scripts + pgTAP + docs only).
    //
    // testTimeout is a HANG ceiling, not a performance target: no assertion here should need
    // seconds, so a generous ceiling costs nothing on the happy path (the suite runs in ~30s) and
    // buys the headroom that starvation flakes need. Raising it — rather than shaving the waits —
    // also keeps every per-test timeout meaningful instead of silently capped.
    testTimeout: 15000,
    hookTimeout: 15000,
    // Keep Playwright's e2e specs out of the Vitest run.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/lib/database.types.ts',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/**/*.d.ts',
        'src/**/*.css',
      ],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
