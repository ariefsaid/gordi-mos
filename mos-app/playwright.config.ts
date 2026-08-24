import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { MOS_DEV_PORT_ENV, devServerBaseUrl, devServerPort } from './src/lib/dev-server'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

// Load .env.e2e for the web-server env injection (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
function loadEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return vars
  } catch {
    return {}
  }
}

const e2eEnv = loadEnvFile(resolve(__dir, '.env.e2e'))

// #419 — worktree-scoped dev server. Port and baseURL derive from THIS tree's absolute
// path, so sibling git worktrees can never contend for one port and a run can never
// silently adopt a listener started elsewhere. e2e/global-setup.ts additionally refuses
// any server that cannot prove (via the mos-dev-identity vite plugin) it belongs to this
// worktree. MOS_DEV_PORT is an explicit escape hatch (rare hash collision); ordinary
// single-worktree use and CI need no environment variable at all.
const devPort = devServerPort(__dir, process.env[MOS_DEV_PORT_ENV])
const baseUrl = devServerBaseUrl(__dir, process.env[MOS_DEV_PORT_ENV])

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // auth journeys share state via admin-API setup; run serially
  workers: 1, // all spec files share mailpit + auth state; must run one-at-a-time
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: baseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // --strictPort: a busy derived port must FAIL LOUDLY here, never auto-hop ports.
    command: `npm run dev -- --port ${devPort} --strictPort`,
    url: baseUrl,
    // Safe to reuse locally ONLY because global-setup verifies the server's worktree
    // fingerprint before any test runs — a foreign listener is refused, not measured.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: e2eEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321',
      VITE_SUPABASE_ANON_KEY: e2eEnv.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
      VITE_SHOW_PLAN_BUDGET: e2eEnv.VITE_SHOW_PLAN_BUDGET ?? process.env.VITE_SHOW_PLAN_BUDGET ?? 'false',
    },
  },
})