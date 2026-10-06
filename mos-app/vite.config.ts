/// <reference types="vitest/config" />
import { dirname, resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer, type PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { legacyRedirectDestination, normalizeBasePath, resolveBuildSettings } from './src/config/build-settings'
import { buildSettingsArtifactsPlugin } from './src/config/build-settings-artifacts'
import { MOS_DEV_IDENTITY_PATH, worktreeFingerprint } from './src/lib/dev-server'
import { createBuildIdentity } from './src/config/build-identity'
import { stampServiceWorker } from './src/config/sw-build-id'
import { validateSampleLoginBuild } from './src/config/sample-login-build-guard'

const __dir = dirname(fileURLToPath(import.meta.url))

// The build's release SHA: Cloudflare Pages provides it; otherwise git; never fails a build.
function resolveReleaseSha(): string {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dir, encoding: 'utf8' }).trim() } catch { return 'unknown' }
}

function redirectToBase(basePath: string): Plugin {
  const base = normalizeBasePath(basePath)
  const bareBase = base === '/' ? '/' : base.slice(0, -1)
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      const request = new URL(req.url ?? '/', 'http://localhost')
      if (base !== '/' && (request.pathname === '/' || request.pathname === bareBase)) {
        res.writeHead(302, { Location: `${base}${request.search}` })
        res.end()
        return
      }
      const destination = legacyRedirectDestination(request.pathname, request.search, base)
      if (destination) {
        res.writeHead(301, { Location: destination })
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

function sampleLoginBuildGuard(): Plugin {
  return {
    name: 'sample-login-build-guard',
    configResolved(config) {
      validateSampleLoginBuild({
        command: config.command,
        sampleLoginEnabled: config.env.VITE_SAMPLE_ONE_CLICK_LOGIN,
        deploymentEnvironment: config.env.VITE_DEPLOYMENT_ENV,
        pagesBranch: process.env.CF_PAGES_BRANCH,
        samplePassword: config.env.VITE_SAMPLE_LOGIN_PASSWORD,
      })
    },
  }
}

// Writes the release SHA into the emitted sw.js; registered before previewBuildIdentity so the
// identity manifest hashes the stamped file.
function serviceWorkerBuildId(): Plugin {
  return {
    name: 'service-worker-build-id',
    apply: 'build',
    closeBundle() {
      const file = resolve(__dir, 'dist/sw.js')
      writeFileSync(file, stampServiceWorker(readFileSync(file, 'utf8'), resolveReleaseSha()))
    },
  }
}

function previewBuildIdentity(): Plugin {
  let identity: ReturnType<typeof createBuildIdentity> | undefined
  return {
    name: 'preview-build-identity',
    apply: 'build',
    buildStart() {
      identity = createBuildIdentity(resolveReleaseSha(), new Date())
    },
    closeBundle() {
      if (!identity) throw new Error('build identity was not created')
      writeFileSync(resolve(__dir, 'dist/mos-build-identity.json'), JSON.stringify(identity))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, __dir, ''), ...process.env }
  const { basePath } = resolveBuildSettings(env)
  const releaseSha = resolveReleaseSha()
  return {
  define: { 'import.meta.env.VITE_RELEASE_SHA': JSON.stringify(releaseSha) },
  base: basePath,
  plugins: [
    redirectToBase(basePath),
    mosDevIdentity(),
    sampleLoginBuildGuard(),
    buildSettingsArtifactsPlugin(basePath),
    serviceWorkerBuildId(),
    previewBuildIdentity(),
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Perf (impeccable/optimize, 2026-07-28): group stable third-party deps into their
        // own named chunks, separate from the app's own eager code (main.tsx/app.tsx/router
        // guards/AppShell/HomePage/LoginPage). These libraries change far less often than app
        // code, so on a repeat visit — the normal case for the primary café/kitchen-floor
        // persona on intermittent connectivity — a browser/CDN cache hit on `vendor-*` means
        // only the small app chunk needs to be re-fetched after a deploy, not the whole bundle.
        manualChunks(id) {
          // Vite's dynamic-import helper must stay in an eager chunk, not follow a lazy one.
          if (id.includes('vite/preload-helper')) return 'vendor'
          if (!id.includes('node_modules')) return undefined
          // The write-up editor's stack loads only with the Write-up tab: its own chunk keeps it out of
          // every eager vendor chunk.
          if (/@blocknote|@ariakit|@tiptap|prosemirror|emoji-mart|linkifyjs|orderedmap|rope-sequence|w3c-keyname|crelt/.test(id)) return 'vendor-editor'
          // Anchored to the package directory: a substring match also catches @floating-ui/react-dom,
          // whose @floating-ui/dom dependency sits in `vendor`, making vendor and vendor-react import each other.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
          if (/react-router/.test(id)) return 'vendor-router'
          if (/@supabase/.test(id)) return 'vendor-supabase'
          if (/@tanstack/.test(id)) return 'vendor-tanstack'
          if (/react-markdown|remark-|micromark|mdast|unist|unified|vfile|hast|property-information|space-separated|comma-separated|html-void-elements|zwitch|longest-streak|ccount|escape-string-regexp|markdown-table|trim-lines|bail|decode-named-character-reference|character-entities|is-plain-obj|trough/.test(
              id,
            ))
            return 'vendor-markdown'
          return 'vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // The Edge Function entry points import the package from outside mos-app/; Deno resolves it there.
    alias: { '@supabase/supabase-js': fileURLToPath(new URL('./node_modules/@supabase/supabase-js', import.meta.url)) },
    globals: true,
    // Shared dev machine: 2 workers unless VITEST_MAX_THREADS says otherwise; CI keeps Vitest's default.
    maxWorkers: Number(process.env.VITEST_MAX_THREADS) || (process.env.CI ? undefined : 2),
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
    // Match jsdom's origin path to Vite's BASE_URL so browser-path helpers use the same build setting.
    environmentOptions: {
      jsdom: {
        url: new URL(basePath, 'http://localhost').href,
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
  }
})
