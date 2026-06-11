import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // auth journeys share state via admin-API setup; run serially
  workers: 1, // all spec files share mailpit + auth state; must run one-at-a-time
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173/mos/',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/mos/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: e2eEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321',
      VITE_SUPABASE_ANON_KEY: e2eEnv.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
  },
})
