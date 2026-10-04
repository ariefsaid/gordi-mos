import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  reporter: 'list',
  projects: [{ name: 'webkit-review', use: { ...devices['Desktop Safari'] } }],
})
