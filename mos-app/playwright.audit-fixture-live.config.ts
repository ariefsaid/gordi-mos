import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MOS_DEV_PORT_ENV, devServerBaseUrl, devServerPort } from './src/lib/dev-server'

const appDir = dirname(fileURLToPath(import.meta.url))

function loadEnvFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(path, 'utf8').split('\n').flatMap((line) => {
      const value = line.trim()
      const split = value.indexOf('=')
      return split > 0 && !value.startsWith('#')
        ? [[value.slice(0, split).trim(), value.slice(split + 1).trim()]]
        : []
    }))
  } catch {
    return {}
  }
}

const fixtureEnv = loadEnvFile(process.env.AUDIT_FIXTURE_ENV_FILE ?? resolve(appDir, '.env.e2e'))
const devPort = devServerPort(appDir, process.env[MOS_DEV_PORT_ENV])
const baseURL = devServerBaseUrl(appDir, process.env[MOS_DEV_PORT_ENV])

export default defineConfig({
  testDir: './e2e/design-quality',
  testMatch: /audit-fixture-live\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{
    name: 'chromium-audit-fixture-live',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  }],
  webServer: {
    command: `npm run dev -- --port ${devPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: fixtureEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321',
      VITE_SUPABASE_ANON_KEY: fixtureEnv.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
      VITE_SHOW_PLAN_BUDGET: 'false',
    },
  },
})
