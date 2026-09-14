import { defineConfig, devices } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MOS_DEV_PORT_ENV, devServerBaseUrl } from './src/lib/dev-server'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)
const configuredBaseUrl = process.env.DESIGN_AUDIT_BASE_URL?.trim()
const baseURL = configuredBaseUrl || devServerBaseUrl(__dir, process.env[MOS_DEV_PORT_ENV])
const artifactDir = process.env.DESIGN_AUDIT_OUTPUT_DIR?.trim()
  ? resolve(__dir, process.env.DESIGN_AUDIT_OUTPUT_DIR)
  : resolve(__dir, 'test-results/design-quality')
const outputDir = resolve(artifactDir, 'playwright-results')

function assertLocalBaseUrl(value: string): void {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('DESIGN_AUDIT_BASE_URL must be an absolute localhost URL') }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('DESIGN_AUDIT_BASE_URL must point to a localhost server')
  }
  if (url.username || url.password) throw new Error('DESIGN_AUDIT_BASE_URL cannot carry credentials')
}

assertLocalBaseUrl(baseURL)

/**
 * Audit-only Playwright entry point.
 *
 * This config intentionally has no ordinary global setup or teardown. Those hooks in the normal
 * e2e config heal shared demo users and delete fixed fixtures; the quantitative lane must own
 * its fixture preparation and cleanup, and it must never silently mutate the shared demo state.
 * The individual specs call runtime identity/lock checks before their first page measurement.
 */
export default defineConfig({
  testDir: './e2e/design-quality',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  outputDir,
  reporter: [['list'], ['json', { outputFile: resolve(artifactDir, 'playwright-report.json') }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-design-audit',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
